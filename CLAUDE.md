# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All frontend work happens in `frontend/` (there is no root-level `package.json`):

```
cd frontend
npm install
npm run dev      # Vite dev server with hot reload, http://localhost:5173
npm run build    # tsc --noEmit && vite build  -> frontend/dist
npm run preview  # serve the built dist locally
```

`npm run build` type-checks before bundling, so it is the single command that catches
everything. For a faster check without bundling, run `npx tsc --noEmit`.

**There is no test framework and no linter configured** — no vitest/jest, no eslint. Do not
invent commands for them. Verification is `npm run build` plus exercising the app in the dev
server.

Serving the production build through the FastAPI server (it only serves `frontend/dist`; it
has no API endpoints, so a frontend rebuild is required after frontend changes):

```
cd frontend && npm run build
cd ../server && pip install -r requirements.txt
start_server.bat     # or: python -m uvicorn main:app --reload   -> http://127.0.0.1:8000
```

## Domain conventions

These are load-bearing for correctness and are easy to get backwards:

- All internal units are **millimeters**, including three.js units (1 unit = 1 mm).
- The build plane lies in **XY** at **z = 0**; its origin (0,0) is the **lower-left corner**,
  extending in +X/+Y.
- Vertical objects (e.g. towers) grow **up into +Z**.
- A `FieldElement`'s `position.y` is the build-plane Y coordinate; note it correlates to
  **-Z in three.js** screen terms, per the original design brief.
- Dominoes are set up **standing**, so a domino's length runs vertically (+Z) and it presents
  only its narrow footprint when viewed from above.
- Real-world measurements live in `src/dimensions.ts` (`DOMINO_SIZE`). Source rendering
  geometry from there rather than hard-coding sizes. (See the global code-style rule on
  not restating constants in comments/docs.)

## Architecture

### Guiding principle: a componentized, extensible framework

Extensibility is a **first-class architectural goal**, not an eventual refactor. The
expectation is that many new element types will be added over time, potentially by
third-party developers, so any file that must be edited once per new type is treated as a
**source-code configuration bottleneck** to be designed away.

The resulting pattern — established for DDObject types and intended as the template for future
extensible subsystems (tools, property editors, exporters):

- Each variant lives in **its own module**, and is **self-describing**: it exports its own
  data shape plus a definition object supplying its metadata (icon, display name) and a
  factory for a default-valued instance.
- A **single registry** file lists the variants. Registration is the only central edit.
- Everything else consumes variants through **registry accessors**, never per-type
  branching. A `switch` on a type discriminant outside a registry is a design smell here.

Prefer extending a registry over adding a central config map or conditional. When adding a
new kind of extensible thing, follow the `object-types/` layout below rather than inventing a
parallel convention.

### State: one zustand store (plus one deliberate exception)

`frontend/src/store.ts` holds all app state — screen, menu/help flags, active tool, the
DDObject hierarchy, the properties-dialog state, and the camera bridge. Components subscribe
with selectors (`useStore((s) => s.foo)`); non-React code reads imperatively via
`useStore.getState()`.

Nothing is persisted; the store is a plain `create()` with no middleware. Every load starts a
fresh default project.

`updateDDObject` is the single write path for DDObject properties — property editors go
through it rather than reaching into `ddObjects` themselves.

**The one exception is `dominoes/store.ts`** (see below). This store is immutable
copy-on-write; that one is bulk typed arrays mutated *in place*. Mixing the two disciplines in
one store would mean cloning a 100k-element buffer on every domino edit, and snapshotting it
for the properties dialog's rollback. So the split is deliberate, and the boundary is:
**this** store holds identity, layout parameters and UI state; **that** one holds per-domino
columns. The dependency runs one way — `dominoes` imports `store.ts`, never the reverse.

**Any `useStore` selector that computes a fresh object/array (rather than reading a stored
reference or a primitive) must be wrapped in `useShallow`** (from `zustand/shallow`), or
`useSyncExternalStore` treats every render as a store change and loops — React error #185,
"Maximum update depth exceeded," and in a canvas component it takes the WebGL context down
with it. `getDDObjectBounds` ([registry.ts](frontend/src/object-types/registry.ts)) is the one
function in this codebase with that shape today, since every `bounds()` implementation returns
a new object literal; `CameraRig.tsx`, `CreateByRegionTool.tsx` and `SelectionTool.tsx` all
subscribe to it and each needs the wrapper. `s.ddObjects[id]` and similar direct reads are exempt — they return the store's own
stable reference, not a computed one.

Screens are a registry, not a router: `ScreenId` -> component in `frontend/src/App.tsx`.

### The DDObject hierarchy and its extensibility contract

This is the part most likely to be implemented wrongly by reflex. The build's contents are a
**flat registry of DDObjects indexed by DDObject id** in the store — `ddObjects:
Record<DDObjectId, DDObject>` plus `rootId` — not a nested tree. Parent/child is expressed by
a `children` array of ids on DDObjects that can have them. Ids are `"DDO-#"`, minted from the
store's `nextDDObjectNumber`. Level 0 is the `BuildPlane` root; level 1 is `FieldElement`.

DDObject types live one-per-folder under `frontend/src/object-types/<name>/`, and each is
**self-describing**: `object-model.ts` exports its data interface plus a
`DDObjectTypeDefinition` (`base.ts`) supplying its icon, default name, a `create()` factory
for a default-valued instance, and optional `modeller`/`bounds` members. The sibling
`editor.tsx` (and `modeller.tsx`, when the type is drawn) are hung off that definition.

**Anatomy of a DDObject type at a glance** — three files (drawn types) plus one registry line:

- **`object-model.ts`** — the data `interface` (the type's shape in the store) *and* its
  `DDObjectTypeDefinition`: `icon`/`defaultName`, the `create()` factory, and the wiring of the
  type's `editor`/`modeller`/`bounds`/`createFromRegion`. Any pure geometry or normalisation
  maths the type needs lives here too (e.g. `fieldElement`'s size↔counts `normalizeSize`).
- **`editor.tsx`** — the property editor: type-specific controls assembled from the shared
  inputs in `components/PropertyFields.tsx`, hosted by `PropertiesDialog.tsx` (see *Property
  editing*). Resolved through the registry; imported by nothing but its own definition module.
- **`modeller.tsx`** *(only when the type is drawn)* — a component of the DDObject returning
  three.js scene nodes. A **domino-producing** modeller does **not** draw dominoes itself: it
  decides where its dominoes go (writing their positions/orientations into the `dominoes` SoA
  store) and renders the shared `dominoes/modeller.tsx` `DominoModeller`, which owns the actual
  meshes (see *Domino data*). `fieldElement/modeller.tsx` is the worked example.

**Rules when adding a DDObject type:**

1. Create `object-types/<name>/object-model.ts` exporting the interface and its
   `DDObjectTypeDefinition`.
2. Create `object-types/<name>/editor.tsx` — the type's property editor, built from the
   shared controls in `components/PropertyFields.tsx` — and hang it off the definition's
   `editor` member. It must be imported by nothing but its own definition module; the
   properties dialog resolves it through the registry.
3. *(Optional, if the type is drawn)* Create `object-types/<name>/modeller.tsx` — a pure
   function of its DDObject returning three.js scene-graph nodes (`<mesh>` etc.) — and hang
   it off the definition's `modeller` member. Declare a `bounds(ddObject)` too if the camera
   should be able to fit or frame it. Same import discipline as the editor.
4. Register it in `object-types/registry.ts` — add the map entry to `DD_OBJECT_TYPES` **and**
   a member to the `DDObject` union. Those two lines are the only central edits. (The union
   member is unavoidable: TypeScript cannot derive a discriminated union from a runtime map
   while preserving each type's concrete shape.)
5. **Consume types through the registry accessors** (`getDDObjectIcon`,
   `getDDObjectDefaultName`, `createDDObject`, `getDDObjectEditor`, `getDDObjectModeller`,
   `getDDObjectBounds`). Do not add `switch (ddObject.type)` branching or a central per-type
   metadata config elsewhere in the app.

`editor`, `modeller` and `bounds` all put the DDObject type in a contravariant position,
which is why `DD_OBJECT_TYPES` is declared against `AnyDDObjectTypeDefinition`
(`DDObjectTypeDefinition<any>`) and the accessors cast back. That erasure belongs to the
registry seam and nowhere else.

`DDObjectsPanel.tsx` renders the hierarchy by recursing from `rootId` through `children`,
driven entirely by store selectors so it updates automatically as DDObjects are created. Each
row carries a hover-revealed **⋯** button opening `DDObjectMenu` (Delete / Properties);
Delete is disabled for the root, and the store's `removeDDObject` refuses it as well.

### Property editing

`components/PropertiesDialog.tsx` is the standard handler for every DDObject type. It owns the
dialog chrome, dragging, the shared Name field and the Save/Cancel semantics; the type-specific
controls come from `getDDObjectEditor`, so adding a DDObject type never means editing it.

The three pieces relate like this: a type's **`editor.tsx`** is a plain set of rows built from
the reusable controls in **`components/PropertyFields.tsx`** (`TextField`, `NumberField`,
`UnitNumberField`, `CheckboxField`, `ColorField`, `Steppers`) — it holds no dialog chrome and
never imports `PropertiesDialog`. **`PropertiesDialog.tsx`** looks the editor up through the
registry (`getDDObjectEditor`) and hosts it, passing each editor an `update` callback wired to
`updateDDObject`. So a new control shared across types is added to `PropertyFields.tsx`; a new
type's editor consumes those controls and is wired only via its own definition.

Editing is a **live preview with commit/rollback**: an editor's `update` writes straight into
the store as the user types — which is what makes the canvas update — and the store holds an
`editingSnapshot` taken when the dialog opened. Save discards the snapshot; Cancel, the close
button and Escape all route through `cancelProperties`, which puts it back. Editors therefore
never buffer a draft of their own (the controls in `PropertyFields.tsx` hold a transient
*string* draft, which is a different thing: it stops a half-typed value like `""` reaching the
scene).

The dialog is deliberately **modeless**. Its scrim covers the viewport at `z-index: 50` and the
canvas area lifts itself above it (`canvasAreaRaised`, `z-index: 60`), so the chrome dims while
the preview stays bright and interactive. Nothing between `.app-content` and `.canvasArea`
establishes a stacking context — keep it that way, or the lift silently stops working.

### three.js / R3F boundary

`designer/DesignerCanvas.tsx` is the R3F `<Canvas>`: orthographic, top-down,
`frameloop="demand"` (so changes made outside the render loop need `invalidate()` to repaint). It
is also `flat` (`NoToneMapping`) — see *Domino data*'s domino-color paragraph below for why exact
color fidelity requires it.

`designer/Scene.tsx` is the **registry-driven scene walker**: it recurses from
`rootId` through `children` and draws each DDObject with the `modeller` its type declares
(via `getDDObjectModeller`), skipping types that declare none. It lives inside the `<Canvas>`
so its store subscriptions drive R3F's repaint. Adding a drawn DDObject type never means
editing `DesignerCanvas`.

`designer/CameraRig.tsx` is the **single bridge** between DOM UI and the three.js camera. It
lives inside the `<Canvas>` and registers an imperative `CameraApi`
(`zoomBy`/`zoomTo`/`resetZoom`/`frameDDObject`) into the store. UI outside the canvas (toolbar
zoom buttons, and eventually DDObject lists) must go through that API rather than touching the
camera directly. It fits the view to whatever footprint the root DDObject's `bounds()` reports
(via `getDDObjectBounds`, shallow-subscribed so renames/recolors don't re-run the fit); if the
root type declares no `bounds()` it warns once and leaves the camera at its defaults.
`frameDDObject(id)` fits any DDObject that declares bounds — it is no longer a stub, though it
is not yet wired to the selection model (nothing calls it on select).

Note that drei's `<OrbitControls>` calls `invalidate()` on its own `change` event, so ordinary
user pan/zoom repaints without CameraRig doing anything. Only imperative changes you make
yourself need an explicit `invalidate()`.

### Domino data

`frontend/src/dominoes/` holds the dominoes themselves, separately from the DDObject
hierarchy. It is **generic on purpose** — fields today, walls/towers/lines later — so it knows
nothing about grids, rows or spacing. The parent element decides where its dominoes go; the
subsystem stores them (`object-model.ts`/`store.ts`) and draws them (`modeller.tsx`).

`object-model.ts` defines `DominoData`, a **Structure of Arrays**: one flat typed array per
attribute (`positions` stride 3, `orientations`, `colorIds` stride 1, `hidden`), plus
`count`/`capacity`. That shape exists because it is what an `InstancedMesh` consumes and because
tens of thousands of dominoes must cost no per-object allocation. `generateDominoes(count)`
allocates and defaults them; `extent(data)` derives a footprint from the dominoes themselves,
which is how an element's `bounds()` stays honest without duplicating layout maths.

**A domino's color is a live reference, not a copy.** `colorIds[i]` holds the `numericId` of a
domino-inventory `InventoryEntry` (`0` = unpainted). Nothing resolves that to actual RGB until
draw time, via `domino-inventory/colorLookupStore.ts`'s `rgbById` table — a plain array indexed
by `numericId`, rebuilt once whenever `inventoryEntries` changes (not per field, not per domino),
so `dominoes/modeller.tsx`'s copy effect never parses hex in its hot path, just indexes into it.
Three things fall out of this for free, with no extra code beyond the lookup table itself:
editing an inventory color's RGB immediately updates every domino painted with it; an undo/redo
entry recording "domino 4812 was color id 7" never drifts even if id 7's RGB changes later
(unlike a baked-in RGB snapshot would); and deleting an in-use inventory color immediately falls
back to `DEFAULT_DOMINO_COLOR` for every domino that referenced it, since `rgbById[deletedId]`
is simply `undefined` after the table rebuilds — the same fallback path the `0` sentinel already
uses, so no separate pruning subsystem was needed. `InventoryEntry` carries both `id`
("INV-{n}", for display/debugging/future persistence) and `numericId` (the same `{n}`, minted
together so they can't drift) specifically so nothing performance-sensitive ever parses the
string form.

**A painted domino must display the exact hex color it was assigned**, matching its inventory
swatch pixel-for-pixel — this took two coordinated fixes, both required together:
`dominoes/modeller.tsx`'s copy effect passes `THREE.SRGBColorSpace` explicitly to
`Color.setRGB(r, g, b, colorSpace)` when converting `rgbById`'s bytes (parsed straight off a
`"#rrggbb"` string by `color.ts`'s `hexToRgbBytes`, so they're sRGB) — omitting the colorSpace
argument makes three treat them as already being in its linear working space, so the renderer's
output conversion gamma-brightens them a second time, washing out dark colors hardest; and
`DesignerCanvas.tsx`'s `<Canvas>` is `flat` (`NoToneMapping`), because R3F's default
`ACESFilmicToneMapping` — built for physically-lit HDR scenes — still visibly shifts saturated
hues (most noticeably reds/oranges) even once the colorSpace fix is in place. This scene is
flat-shaded and unlit by design (no lights anywhere, `meshBasicMaterial` on every domino), so
tone mapping has no physical scene to compensate for and only introduces color error. Both are
load-bearing: dropping either one reintroduces a visible mismatch between a domino and its
inventory color.

**A domino's `colorIds` entry survives a regenerate**, via `dominoes/colorMemory.ts`'s
`restoreDominoColors`, called once per regenerate (screen-switch remount, resize, undo/redo of
either — anything that makes a domino-producing type's modeller rebuild its `DominoData` from
scratch). Without it, every regenerate would silently wipe every domino back to unpainted, since
`generateDominoes()` always zero-fills `colorIds`. The mechanism is registry-driven, not
`fieldElement`-specific: a type opts in by declaring `dominoCellId(ddObject, flatIndex)`
(`object-types/base.ts`) — a **stable identifier for the domino at `flatIndex` that must not
depend on the parent's current physical size**. This is the load-bearing contract: a domino with
cell id `X` must refer to the same logical domino (e.g. the same `(row, col)`) no matter how many
rows/columns the parent currently has, or memory recorded at one size becomes meaningless — or
worse, silently wrong — when looked up at another size. `fieldElement` encodes `(row, col)`
directly (`row * 1_000_000 + col`); only the *decode* from `flatIndex` to `(row, col)` depends on
the field's current `dominoes_per_row`, never the id's own meaning. A future spiral/rings type
must uphold the same contract for whatever coordinate scheme it uses — `restoreDominoColors`
itself never interprets a cell id, only uses it as an opaque `Map` key, so any stable scheme
works. `colorMemory.ts`'s store is keyed by `DDObjectId` and holds, per parent, a `colorByCell`
map plus the last `ddObject` snapshot seen (needed to decode the *previous* regenerate's flat
indices before they're overwritten). Cells that merely fall outside the currently-live range
(a shrink) are never deleted from `colorByCell` — which is also why a shrink followed by a later
grow, even in a wholly separate gesture or session, restores the old colors rather than
defaulting new cells to unpainted: nothing here scopes memory to a single "operation," by design.

`colorByCell` has a second writer besides `restoreDominoColors`'s regenerate-time absorb/restore:
`syncDominoColorMemory`, called from the three places that mutate a live `colorIds` array
directly without going through a regenerate — `applyColorToSelectedDominoes` (the initial paint)
and the `"dominoColors"` cases of `undo()`/`redo()` (`store.ts`). This exists because
`restoreDominoColors`'s absorb step only ever *adds* entries (it records a cell's color when
absorbing it off the live array only if that color is nonzero, so a live color of `0` is treated
as "nothing to absorb," never as "clear this cell") — so on its own it could never learn that a
previously-painted cell had been explicitly reverted to unpainted by an undo. Without
`syncDominoColorMemory`, that stale nonzero entry survives in `colorByCell` until some later
regenerate reads it and repaints the cell, resurrecting a color the user had explicitly undone —
concretely: paint a field, undo the paint (colors correctly disappear, since that only touches
the live array), then delete the field and undo the delete (a regenerate, since the DDObject
remounts) — the field would come back wrongly recolored. `syncDominoColorMemory` closes this by
writing (or, for a revert to `0`, deleting) each affected cell's entry immediately, keeping
`colorByCell` a live mirror of "current colorId per painted cell," not just a lazily-absorbed
snapshot from the last regenerate.

Load-bearing conventions:

- **Deletion is a tombstone** (`hidden = 1`), never a swap-remove, so **a domino's index is
  stable for the life of its parent**. The planned operation/undo stack depends on that: an op
  names "domino 4812" and stays valid across any undo/redo. Hidden dominoes stay in the draw
  collapsed to zero scale rather than compacting the buffer.
- **Positions are parent-relative**; the modeller puts them under a `<group>` at the parent's
  position, so moving a whole element is a transform, not a buffer rewrite.
- `positions` carries a **z** and `orientations` carries **sideways/flat** that are unused in
  this version. They exist so later element types need no data migration.
- Buffers are **mutated in place**; `versions[parentId]` in the store is the change signal.
  Consumers subscribe to the version, not the buffer.
- `initDominoData()` must be called once at startup (it is, from `main.tsx`). It frees an
  element's dominoes when the element is deleted, by watching the DDObject store. It is an
  explicit call rather than a module-load side effect because subscribing at load would read
  the main store mid-construction through the module cycle. `initDominoColorMemoryPruning()`
  (`colorMemory.ts`) is the same pattern for a parent's cross-regenerate color memory, called
  alongside it. **Neither prunes the instant a DDObject leaves `ddObjects`** — a delete is
  undoable, so both defer via `store.ts`'s `isDDObjectInUndoHistory(id)`, which scans
  `undoStack`/`redoStack` for any operation still referencing `id` (a `delete` whose subtree
  includes it, chiefly). Pruning immediately would mean undoing a delete brings the DDObject
  back with its dominoes already garbage collected — no positions, no colors, nothing to
  restore. Both subscriptions re-check on `undoStack`/`redoStack` changes too, not just
  `ddObjects`, since reachability can change on its own (a delete aging off the 100-entry
  history cap, or being discarded when a later action clears the redo stack) without
  `ddObjects` itself changing on that particular update. `dominoes/selectionStore.ts`'s
  `initDominoSelectionPruning()` deliberately does **not** follow this pattern — it prunes
  immediately, since which dominoes were *selected* isn't state a user expects back after
  undoing a delete.

The subsystem is split into a **parent half** (per element type, decides layout) and a **shared
drawing half** (`dominoes/modeller.tsx`, one implementation for every type).
`object-types/fieldElement/modeller.tsx` is the worked example of the parent half: it owns the
grid maths, and when a layout parameter changes it regenerates the dominoes, calls
`restoreDominoColors` (above) to carry forward any existing colors, and `put()`s the result into
the store — then renders `<DominoModeller>` and draws nothing itself. Any future domino-producing
type does the same: compute a layout, restore colors, write the store, render `DominoModeller`,
and declare its own `dominoCellId` to opt into the restore step at all.

`dominoes/modeller.tsx`'s `DominoModeller` draws a parent's dominoes as two objects sharing one
set of per-domino transforms: a **filled `InstancedMesh`** (one geometry/material/draw call,
per-domino `instanceColor`, resolved from `colorIds` through the color lookup table above) and an
**edge outline**, white for a selected domino and black otherwise (domino editing mode's
selection, see *Selection and direct manipulation* and *Domino color editing* below). Note
`InstancedMesh` does *not* read `DominoData` — it owns `instanceMatrix`/`instanceColor`, so
`DominoModeller` copies the columns across (expanding x/y/z into a 4×4 matrix) and sets
`needsUpdate`; its instance count is fixed at construction, hence the `key={capacity}` remount
when a field is resized. The outline can't be an `InstancedMesh` (that renders triangles, not
lines), so it is an **instanced `LineSegments`**: one base `EdgesGeometry` of a domino box, drawn
once per domino via per-instance `aOffset`/`aScale`/`aOutlineColor` attributes placed by an
`onBeforeCompile`-patched `LineBasicMaterial` (one shared material for every field in the app —
`aOutlineColor` is what lets each instance differ). Same one-draw-call, no-per-object-allocation
budget as the fill.

Per-domino selection and color editing now exist (domino editing mode — see *Domino editing
mode* and *Domino color editing* below), both riding the same `Operation` union DDObject-level
undo/redo already used (see *Undo/redo*), exactly as anticipated when that union was designed.

### Domino editing mode

Double-click a domino-editable DDObject (on the canvas via `SelectionTool.tsx`'s `PickPlane`, or
its row in the sidebar's `DDObjectsPanel.tsx`) to enter it — `store.ts`'s `enterDominoEditing`
sets `dominoEditingId` and switches `activeTool` to `"editDominoes"`, a `ToolId` with **no
toolbar entry** (entry is exclusively by double-click). That one value is deliberately enough on
its own to disarm `SelectionTool`/`CreateByRegionTool`/`onPointerMissed` (none of them match
`"select"` or an `elementType`-bearing tool anymore) and to swap `Sidebar.tsx`'s child from
`DDObjectsPanel` to `DominoColorPanel` — no scattered `dominoEditingId` checks needed in those
files. The mode is **fully modal**: Toolbar/undo-redo/the sidebar all disable via that same
`activeTool` check, and only `ModeHintBar`'s Done/Cancel buttons (`exitDominoEditing`) leave it —
Escape never does, even though it clears a lot of in-mode state (see below).

`designer/DominoEditTool.tsx` is the canvas tool owning everything once inside the mode:
per-domino selection (click / Ctrl+click / drag-rubberband / Ctrl+drag / arrow-keys /
Shift+arrow-keys, stored in `dominoes/selectionStore.ts`'s `DominoSelectionEntry` — `selected`,
plus `anchor`/`active`/`baseSelection` for Shift+Arrow's Excel-style rectangle
grow/shrink/cross-the-anchor behavior) and, layered on top of that, color assignment (below).
Domino hit-testing raycasts directly against the field's `InstancedMesh` via `hitDominoIndex`
rather than through R3F's synthetic pointer-event system, because that system only considers
objects with their own pointer-event props — and the mesh deliberately has none, so
`SelectionTool`'s DDObject-level pick planes underneath it keep receiving clicks (see *Domino
data* above).

### Domino color editing

While in domino editing mode, `Sidebar.tsx` shows `DominoColorPanel.tsx` — a grid of swatches,
one per **active** domino-inventory entry — instead of the object hierarchy. Two ways to color
the current selection, both immediate and both push exactly one undoable `"dominoColors"`
operation (see *Domino data* above for why that's a live color-id reference, not baked-in RGB):

- **Select dominoes, then choose a color** — click a swatch, or type its `shortcut` (matches
  narrow live as you type; a unique match applies immediately; Space applies the *exact* match
  when a longer one is also a valid prefix, e.g. disambiguating "B" from "B1"). Shortcut state
  (`dominoColorShortcut`) and its ~1.2s inactivity auto-clear live in `DominoEditTool.tsx`'s
  keyboard handler, reusing its existing typing-guard and Escape/pointer-gesture cleanup. That
  handler returns early on any Ctrl/Cmd+key combo before reaching the shortcut-typing branch, so
  Ctrl+Z/Ctrl+Y (undo/redo) reach `DesignerScreen.tsx`'s handler instead of being swallowed as a
  one-letter shortcut buffer entry.
- **Choose a color first, then select dominoes** — double-click a swatch to lock it
  (`dominoColorLockedId`, badge via `RiLockFill`); every domino selected afterward, by any
  method, is recolored to it immediately (`DominoEditTool.tsx`'s `applyLockedColorIfAny`, called
  after every selection-setting gesture). Locking also colors whatever's already selected at
  that moment, since a double-click's first `click` already applies the color before `dblclick`
  fires the lock — not a special case, just how the browser sequences the two events. Clicking a
  *different* swatch while one is locked unlocks it (then applies the new color as an ordinary
  click); clicking the already-locked swatch is just a no-op re-apply. Escape clears the
  selection, the lock, and any in-progress shortcut buffer all at once; so does exiting the mode.
  Only one color locks at a time. `ModeHintBar` swaps its sentence while locked.

Clicking a swatch with nothing selected is a documented no-op — nothing to apply to.

### Element placement and creation

Placement tools draw their element onto the build plane rather than dropping a default one.
`designer/CreateByRegionTool.tsx` is **fully generic** — it imports no concrete DDObject type,
only the registry — which makes it the pattern to copy alongside `Scene.tsx` and `CameraRig.tsx`:

- It lives **inside** the `<Canvas>`, because a region has to be read in build-plane
  millimetres and a raycast gives exactly that — `event.point`'s world X/Y *are* build-plane
  coordinates, since the plane's origin is the world origin.
- Its pointer-catching plane is `transparent` with `opacity={0}`, **not** `visible={false}`,
  which would opt it out of raycasting entirely. It is sized and clamped to the root's
  footprint via `getDDObjectBounds` — the same accessor `CameraRig` uses — never a cast to any
  concrete root type.
- It arms only when the **active tool declares a target type** and **no properties dialog is
  open**. A tool declares its target via `elementType` on its `ToolDef`
  ([toolConfig.ts](frontend/src/designer/toolConfig.ts)) — the one place the binding between a
  tool and the type it places lives, declaratively. The dialog guard is load-bearing: the
  dialog is modeless and the canvas stays interactive above its scrim, so without it a user
  could drag behind the open dialog and two Escape handlers would fight.
- Drag state is component-local; only the finished rectangle reaches `createElement`. Escape
  mid-drag clears the start ref, which is also what makes the pending pointer-up a no-op.
- **The rectangle-to-DDObject mapping is the type's own concern**, not the tool's: a type
  declares `createFromRegion?(region: DDObjectBounds): Partial<T> | undefined` on its
  `DDObjectTypeDefinition`, resolved via `getDDObjectCreateFromRegion`. `undefined` means the
  region was too small/invalid, and the tool discards it exactly like a cancelled drag. This
  mapping has to be per-type because each type's model shapes position/size differently —
  `buildPlane` has no position at all, `fieldElement` splits it into `position` plus
  `width`/`height`. There is deliberately **no richer create/update/finalize protocol**: the
  drag preview is already generic (a plain rectangle), and the DDObject isn't created until
  mouse-up, so nothing today needs a live type-specific preview mid-drag.
- `designer/ModeHintBar.tsx` prompts the user. Adding a placement tool means adding an entry to
  its `HINTS` map, not editing its markup.

Creation itself is registry-driven: `store.createElement(type, patch)` mints the DDObject under
the root and opens its properties in **creating** mode, tracked by `creatingDDObjectId`. That
flag is the whole difference between creating and editing — **Cancel on a creation deletes the
DDObject**, where Cancel on an edit rolls its properties back, and finishing either way returns
the active tool to Select. There is no per-type creation logic in the store.

### Selection and direct manipulation

The store holds a single `selectedDDObjectId` (distinct from `activeTool`, which is the drawing
tool). `designer/SelectionTool.tsx` is the canvas half and, like `CreateByRegionTool.tsx`, is
**fully generic** — it manipulates any DDObject the registry reports as selectable-with-a-footprint
and references no concrete type. It arms only for the Select tool with no dialog open, so it and
`CreateByRegionTool` are mutually exclusive. It draws a light-gray overlay + border over the
selected object's `bounds()`, offers **move** (drag the body) and **resize** (drag a corner/edge,
with the opposite corner/edge anchored), and deletes on `Delete`. Selection also happens from the
sidebar (`DDObjectsPanel` row click) and clears on a click that misses every object (an empty spot
on the plane, off the plane via the `<Canvas onPointerMissed>`, blank sidebar space, or Escape).

Two registry members drive it, alongside `bounds()`:

- **`selectable?: boolean`** on the `DDObjectTypeDefinition` (default selectable; the root
  `buildPlane` sets `false` — it is the world frame, not a movable object). Consumed via
  `isDDObjectSelectable`.
- **`setBounds?(ddObject, bounds): Partial<T> | undefined`** — the write path for move/resize, the
  manipulation analogue of `createFromRegion`, resolved via `applyDDObjectBounds`. Per-type for the
  same reason: each type maps a target rectangle onto its own position/size fields. `undefined`
  means the target is too small/invalid and the tool discards that drag frame. `fieldElement`'s
  implementation rounds through the field's `displayUnit` and runs `normalizeField`, and a **resize
  forces `fixed_size` on** so the drag sticks (a pure move leaves it alone).

Deliberate decisions a fresh session could otherwise reverse:

- **Move/resize write live through `updateDDObject`**, with no snapshot of their own — identical
  to how the property editors preview. Both move/resize and Delete are undoable now (see
  *Undo/redo*); the "before" state undo needs is captured by the caller (`dragRef.current`'s
  `originalObject` here, `editingSnapshot` for the dialog), not by `updateDDObject` itself.
- **Move/resize are clamped to the build plane** (the tool clamps the target rect to the root's
  `bounds()` before calling `setBounds`), matching how `CreateByRegionTool` clamps a new region.
- **The overlay draws with `depthTest={false}` + a high `renderOrder`**, not a tall z, so it floats
  over the standing dominoes without the generic tool needing to know how tall a domino is. Its
  pick planes stay at low z and still work because dominoes are handler-less meshes that don't stop
  the ray. During a drag a huge transparent catch-plane is mounted so pointer move/up keep arriving
  when the cursor leaves the grabbed handle — the same role the placement tool's footprint plane
  plays.

### Undo/redo

`store.ts` holds a single unified `undoStack`/`redoStack` over a discriminated `Operation`
union (`create` / `delete` / `transform` / `properties` / `dominoColors`) — one stack for
every DDObject-level (and now domino-color-level) change, not a separate stack per
subsystem. Two independent histories can't preserve true chronological ordering without
effectively rebuilding one timeline anyway, so this stays one stack.

`isDDObjectInUndoHistory(id)` scans both stacks for any operation still referencing a
DDObject id — used by `dominoes/store.ts` and `dominoes/colorMemory.ts` to defer freeing a
deleted DDObject's dominoes/color memory until its `delete` operation is no longer
reachable via undo or redo, so undoing a delete restores colors instead of resurrecting an
object with its domino data already garbage collected. See those files' "Domino data"
section entries for the full rationale.

**Undo is clamped while in domino editing mode.** `enterDominoEditing` snapshots
`undoStack.length` into `dominoEditingUndoFloor`; `undo()` refuses once `undoStack.length` would
drop to or below that floor, so undo inside the mode can only reach back to the state the field
was in when the mode was entered — never past it into whatever created the field or edited it
beforehand. `exitDominoEditing` resets the floor to `null`, so undo outside the mode is
unclamped again (and so is redo, always — only undo needs clamping, since redo only replays
operations already popped in this same session). `Toolbar.tsx`'s Undo button disables at the
clamp the same way it disables on an empty stack. This is deliberate scoping, not a side effect
of anything structural: nothing stops a `"dominoColors"` op from being undone outside the mode
(undoing a color change works whether or not domino editing mode is active — see *Domino data*'s
`dominoColors` case), so without this floor, undo from inside the mode would silently walk back
through unrelated DDObject-level history too.

Every variant stores **whole-DDObject snapshots**, never per-field patches — `fieldElement`'s
`normalizeSize` coupling (width/height ↔ counts via `fixed_size`) makes fields too
interdependent to diff/reapply piecemeal, so undo/redo always restores (or removes/reinserts)
a complete object.

The commit points are deliberately **not** where the data first changes — `updateDDObject`
fires continuously (once per keystroke in the properties dialog, once per pointermove frame
during a canvas drag) and is never itself a commit, matching how it was already just the shared
write primitive before undo/redo existed. The real commits are `saveProperties()` (covers both
a properties-edit session and a creation session, branching on whether `creatingDDObjectId` was
set — a creation records the finished object as a `create`, never a chain of the edits made
while its just-opened dialog was still up) and `SelectionTool`'s `endDrag(false)` (a successful
drop, via the new `recordTransform` action). `removeDDObject` is the one exception: already
atomic at both its call sites (`SelectionTool`'s Delete key, `DDObjectMenu`'s Delete button), so
it records directly. Both commit points diff before/after (`ddObjectsEqual`, a `JSON.stringify`
comparison — cheap since it only ever runs at a commit, never per-frame) and push nothing when
nothing actually changed, so opening-and-Saving a dialog with no edits, or a zero-distance drag,
adds no undo entry. Cancel (`cancelProperties`) and Escape-mid-drag were already fully
self-healing before undo/redo existed and still need no entries: nothing was ever pushed for a
cancelled session, so there is nothing to invert.

**Re-entrancy is the load-bearing constraint**: applying history (`undo()`/`redo()`) must never
itself record a new operation, or inverting a `create` would push a `delete`, corrupting the
stacks. The fix is a raw/public split, not a suppression flag — `removeDDObject` is a thin
recording wrapper around the non-exported `applyRemoveDDObject` (and its inverse,
`applyInsertDDObjects`); `undo()`/`redo()` call these raw helpers directly and never the public
action, so there's no flag for a future instrumented action to forget to check. This is also
why `cancelProperties`'s discard-on-cancel-a-creation path calls `applyRemoveDDObject` directly
rather than the public `removeDDObject`: a cancelled creation never had a `create` pushed for
it, so discarding it through the recording path would push a dangling `delete` with nothing to
pair against, and undoing that later would resurrect an object the user explicitly discarded.

A `delete` operation stores the whole removed subtree (`collectSubtree`'s doomed set, snapshot
before removal) plus the *external* parent and index only the subtree's root sat at — a
descendant's own parent link is already correct in its own snapshot, so undo only needs to
splice the root back into its live parent's `children` at the original index (not append),
which is what keeps deleting a middle sibling and undoing it from moving it to the end of the
list.

### Help system

`help/topics.ts` auto-discovers `help/content/*.md` via `import.meta.glob(..., eager: true)`,
deriving each topic's id from the filename and its title from the first `#` heading. Adding a
help topic means adding a markdown file — no registration needed. `help/registry.ts` optionally
maps a screen to a topic id, falling back to `home`.

## Current state and direction

Deliberate decisions that are **not** derivable from the code, and that a fresh session could
otherwise "correct" backwards:

- **`buildSize` is gone.** The root `BuildPlane` DDObject is the sole source of the plane's
  size and color; its `modeller.tsx` draws it, and `CameraRig`'s fit/`minZoom` read the
  size through the plane's declared `bounds()` rather than a cast. Do not reintroduce a
  separate app-level build size, and note the Settings screen is now deliberately empty —
  its one control moved onto the DDObject.
- **Nothing is persisted.** Retiring `buildSize` left the `persist` middleware with nothing
  to write, so it was removed from `store.ts`; the DDObject hierarchy was always excluded on
  purpose, so every load still starts a fresh default project. Re-adding persistence means
  re-wrapping the store and choosing a `partialize`.
- **Per-domino colouring exists now** (domino editing mode's color panel — see *Domino color
  editing*), assigned from the domino inventory rather than a free picker, referenced by id
  rather than copied as RGB (see *Domino data*'s `colorIds`/`colorLookupStore.ts` note).
- **A field's dominoes are still regenerated wholesale** whenever a layout parameter changes —
  `generateDominoes` always zero-fills a fresh `DominoData` — but this no longer loses colors:
  `restoreDominoColors` (*Domino data*) carries them forward, keyed by each domino's stable
  `dominoCellId`, across a resize, a screen-switch remount, or an undo/redo of either. `hidden`
  tombstones aren't preserved the same way yet (nothing sets `hidden` to 1 anywhere in this
  codebase today — no per-domino delete feature exists), but the same registry-driven mechanism
  would extend to it directly whenever that feature lands, since a domino's cell id is exactly
  what such a feature would need too.
- **A field is described twice over, and `fixed_size` picks which one wins.** Checked, the
  physical `width`/`height` are authoritative and the counts refit to them; unchecked, the
  counts are authoritative and the size grows to hold them exactly. `normalizeSize` in
  `fieldElement/object-model.ts` is the **single** expression of that relationship —
  `normalizeField` (the editor, `create()`) and `createFromRegion` (the placement tool) are
  both thin callers of it over different shapes, so the two descriptions can never disagree.
  It defaults **on**, because the expected next action after drawing a region is adjusting
  spacing within it.
- **The field's geometry maths lives in its `object-model.ts`**, not a separate module, so the
  per-type folder keeps its object-model/editor/modeller shape. `modeller.tsx` therefore
  imports values from `object-model.ts` while that module imports the modeller as a value — a
  cycle that is benign *only* because nothing reads across it during module initialisation.
  **Never call `pitchX`/`pitchY`/`normalizeSize`/`normalizeField`/`createFromRegion` at
  module scope.**
- **`extent()` in `dominoes/object-model.ts` is currently uncalled.** A field's `bounds()` now
  reports its physical size, which needs no generated dominoes and is always defined. `extent`
  is kept as the generic footprint primitive other element types will want.
- **`color` is a `"#rrggbb"` hex string** specifically because that is the shape color-picker
  controls consume directly — including the native `<input type="color">` that `ColorField`
  wraps, which is why no color-picker dependency was added.
- **Selection exists now** (`selectedDDObjectId`, see *Selection and direct manipulation*), but
  `CameraApi.frameDDObject` is still not called on select — framing a selected object is left for
  later. The row ⋯ menu continues to act on its own DDObject independently of what is selected.

## Code style

- Co-located CSS Modules: `Component.tsx` + `Component.module.css`, imported as `styles`.
- Shared design tokens are CSS custom properties (`--color-chrome`, `--color-text-dim`,
  `--color-accent`, `--sidebar-width`, ...) defined in `src/global.css`. Use them rather than
  hard-coded colors so new UI matches the existing chrome.
- Icons come from `@remixicon/react` as React components (`RiSquareLine`, `RiGridFill`), passed
  around typed as `RemixiconComponentType` — not string names.
- Comments in this codebase explain *why* and flag interim decisions (e.g. "Stub for v1").
  Match that density rather than narrating what the code plainly does.
- **DDObject naming.** Any identifier — variable, parameter, prop, type, or function — that
  holds or means a DDObject (as opposed to an incidental JS object, e.g. three.js `Object3D`
  or a plain object literal) is named with the `ddObject`/`DDObject` convention: `ddObject` /
  `ddObjects` for values, `DDObjectXxx` for types (`DDObjectBounds`, `DDObjectTypeDefinition`),
  and `xxxDDObjectXxx` for functions or props that operate on one (`updateDDObject`,
  `getDDObjectIcon`, `ddObjectId`). A bare `object` in this codebase should always mean
  something that is *not* a DDObject; if it does mean one, rename it. The per-type union member
  aliases carry the suffix too (`BuildPlaneDDObject`, `FieldElementDDObject`). Identifiers
  already unambiguous through an `Id`-typed-as-`DDObjectId` suffix (`rootId`, `parentId`) are
  exempt — don't force those to stutter.
