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

**`vite.config.ts` sets `build.sourcemap: true`**, so an error in the *built* app served through
FastAPI reports a real file and line in `src/` rather than an offset into the minified bundle. The
`.map` sits beside the bundle and is only fetched when devtools is open, so it costs nothing at
runtime; it does publish the source, and `"hidden"` is the setting to switch to if that ever
matters. `npm run dev` has always had accurate stacks — this is only for the production build.

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
- A `FieldElement`'s `position`/`width`/`height` is its **boundary rectangle**, not the
  bounding box of its dominoes. The dominoes are laid out from `anchorX`/`anchorY` instead, so
  the two can legitimately differ by up to one pitch — see *The field's anchor model*.
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
DDObject hierarchy, the properties-dialog state, the camera bridge, and (via a slice, see
below) the domino inventory. Components subscribe with selectors (`useStore((s) => s.foo)`);
non-React code reads imperatively via `useStore.getState()`.

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

That bar — *a different mutation discipline* — is the whole test for earning a store of your
own. Ordinary copy-on-write state that merely belongs to one feature does **not** qualify; it
becomes a **slice** of the app store instead.

#### Slices

`store.ts` grew past a thousand lines holding every feature's state inline, so a feature's
members live in an `appStoreSlice.ts` under that feature's own folder while remaining part of
the one `AppState`. Six exist today:

| Slice | Holds |
|---|---|
| `domino-inventory/appStoreSlice.ts` | the inventory catalog, its selection and its sort |
| `history/appStoreSlice.ts` | `Operation`, the undo/redo stacks, the domino-editing undo barrier |
| `dominoes/appStoreSlice.ts` | the selected swatch and the shortcut buffer, every domino-colour write (including a paint stroke's), select-by-swatch, the Expand toggle, and domino editing mode's cancel snapshot |
| `shape-select/appStoreSlice.ts` | which shape-select gesture is armed inside domino editing mode, and its hint text |
| `paint-brush/appStoreSlice.ts` | which paint brush is armed inside domino editing mode, and each brush's chosen size |
| `image-map/appStoreSlice.ts` | the picture laid over each element, the two image sub-modes' view state, the chosen patch sampler, colour-distance metric and dither, which colours a run may pick from and which dominoes it may colour, whether entering mapping found anything to do, and the run itself |
| `build-plan/appStoreSlice.ts` | which printed plan's options dialog is open and for which element, and each plan's remembered settings |

What's left in `store.ts` is the state that isn't any one feature's: screen/menu/help, the
DDObject hierarchy and its actions, domino editing mode, the properties dialog, and the camera
bridge.

The shape, and why each part is what it is:

- A slice module exports its own interface plus a `StateCreator<AppState, [], [], ItsSlice>`.
  The **first** type argument is the whole `AppState`, not the slice — that's what lets a
  slice's `set`/`get` read every other slice's members with no plumbing, which is exactly what
  keeps this from fragmenting into separate stores. The **last** narrows what the creator must
  return, so a member dropped during a move is a compile error. The two `[]`s are middleware
  mutator slots, empty because there is no middleware.
- `store.ts` declares `AppState extends ItsSlice` and spreads `createItsSlice(set, get, api)`
  into the initializer. `AppState` is exported for slices to type against. The type recursion
  (`AppState` extends the slice; the slice's creator references `AppState`) is fine — it passes
  through a generic parameter rather than an alias expansion.
- **Naming: `appStoreSlice.ts`, in the feature's folder.** Deliberately not `slice.ts`, because
  `dominoes/` and `clipboard/` already have a `store.ts` of their own — `appStoreSlice.ts` says
  unambiguously "this feature's slice of the *app* store," as distinct from a store the feature
  owns outright.
- A slice imports `AppState` **type-only**. `domino-inventory`'s and `shape-select`'s need
  nothing else from `store.ts` and are therefore fully acyclic; the other two reach
  `dominoes/store.ts` and `dominoes/colorMemory.ts`, which import `useStore` back, so they sit
  in a cycle.

**`store.ts` must remain the only importer of a slice's creator.** That cycle
(`store.ts` → slice → `dominoes/*` → `store.ts`) is safe *only* while `store.ts` is the module
that enters it. Entered at a slice instead, `store.ts`'s body runs while the slice module is
still mid-evaluation and calls `createXxxSlice` before the `const` is initialized. It fails
loudly at startup rather than silently, but it fails. Import a slice's *types* from anywhere;
import its creator only from `store.ts`.

Two things exist specifically to keep that cycle as small as it is:

- **`ddObjectOps.ts`** holds the pure hierarchy operations (`applyRemoveDDObject`,
  `applyInsertDDObjects`, `collectSubtree`, `ddObjectsEqual`) that both `store.ts`'s recording
  actions and history's `undo`/`redo` need. Putting them in a neutral module is what lets
  history avoid a value import from `store.ts` — and it also makes the raw/public split
  structural: a module that cannot reach an action cannot accidentally record one (see
  *Undo/redo*'s re-entrancy note).
- **`isDDObjectInUndoHistory` stays in `store.ts`**, even though it is conceptually history's,
  because it queries the *live store*. History exports the pure per-operation predicate
  (`operationReferencesId`) it runs. Moving the query into the slice would add the one value
  import the split is avoiding.

Consumers are unaffected either way: `useStore((s) => s.inventoryEntries)` and
`useStore.subscribe` work identically whether a member is declared inline or in a slice. Moving
members into a slice is therefore a pure refactor with no call-site churn — which is the point,
and why all three moves touched no component.

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
  maths the type needs lives here too (e.g. `fieldElement`'s counts→size `normalizeSize` and the
  `fitCount`/`signedFitCount` pair that runs it the other way).
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
   `getDDObjectBounds`, `getDominoExpansion`, `getDominoLayoutAnchor`). Do not add
   `switch (ddObject.type)` branching or
   a central per-type metadata config elsewhere in the app.

`editor`, `modeller` and `bounds` all put the DDObject type in a contravariant position,
which is why `DD_OBJECT_TYPES` is declared against `AnyDDObjectTypeDefinition`
(`DDObjectTypeDefinition<any>`) and the accessors cast back. That erasure belongs to the
registry seam and nowhere else.

`DDObjectsPanel.tsx` renders the hierarchy by recursing from `rootId` through `children`,
driven entirely by store selectors so it updates automatically as DDObjects are created. Each
row carries a hover-revealed **⋯** button opening `DDObjectMenu` (Delete / Properties / Edit
Colors, plus one item per registered build plan); Delete is disabled for the root, and the
store's `removeDDObject` refuses it as well. **Edit Colors is the named way into domino editing
mode** — double-clicking the row or the element on the canvas does exactly the same thing, and
all three gate on the same `isDominoEditable`. It is *hidden* rather than disabled when the type
declares no such mode, matching the build-plan items below it.

### Property editing

`components/PropertiesDialog.tsx` is the standard handler for every DDObject type. It owns the
dialog chrome, dragging, the shared Name field and the Save/Cancel semantics; the type-specific
controls come from `getDDObjectEditor`, so adding a DDObject type never means editing it.

The three pieces relate like this: a type's **`editor.tsx`** is a plain set of rows built from
the reusable controls in **`components/PropertyFields.tsx`** (`TextField`, `NumberField`,
`OptionalNumberField`, `NumberPairField`, `UnitNumberField`, `ColorField`, `SelectField`,
`CheckboxField`, `ReadOnlyField`, `Steppers`, plus `Separator` and `SectionHeader` for grouping)
— it holds no dialog chrome and never imports `PropertiesDialog`. Note the module-private
**`NumberInput`** holds the half-typed-value handling that `NumberField`, `NumberPairField` and
`OptionalNumberField` share; a fourth control wanting a number box should use it rather than
copying the draft logic a fourth time.

Two of those need saying apart, because the difference between them is easy to collapse:

- **`OptionalNumberField` may be left empty, and empty is a value** — it hands back `null`, and
  whoever reads the setting decides what that means. `NumberInput`'s `allowBlank` is what
  distinguishes it from every other box, where an empty box is a *transient editing state* that
  is deliberately never committed (a zero-width plane in the scene, a divide-by-zero in the
  camera's fit). It is a separate control rather than a flag on `NumberField` because an
  optional value returns `number | null`, and widening `NumberField`'s `onChange` to match would
  push that null onto every existing call site to no purpose. Its `placeholder` is how the box
  says what leaving it empty will do — "auto". The print layout's page counts are the case it
  was written for (see *Build plans*).
- **`ReadOnlyField` is never editable at all**, so it renders plain text and takes no
  `onChange`. `NumberField`'s `disabled` covers the neighbouring case — a derived value the
  control *could* have edited, shown in a real (greyed) box. `fieldElement`'s "Total dominoes"
  row is the first user.
**`PropertiesDialog.tsx`** looks the editor up through the
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
`frameDDObject(id)` fits any DDObject that declares bounds. Two callers, both domino editing
mode's: `enterDominoEditing` (per-domino work at build-plane zoom is unusable) and `Toolbar`'s
fit button, which frames the edited field instead of calling `resetZoom` while the mode is on —
fitting the whole plane there would zoom out of the very thing the mode exists to work on, so
in-mode it returns the view to exactly what entering produced. It is deliberately **not** wired
to the selection model (nothing calls it on select). It is the only fit that
applies `FRAME_FILL`, a margin so the framed object isn't flush with the canvas edge; the
initial fit and `resetZoom` stay edge-to-edge, so Reset Zoom always lands on exactly the same
view. Nothing restores the prior view on leaving the mode — Reset Zoom is the way back out, by
design.

**`controls.minZoom` is deliberately *not* the fit-the-plane zoom**, but `MIN_ZOOM_FILL` times
it, so the plane can be zoomed down to a fraction of the viewport. It was the exact fit once, on
the reasoning that nothing worth looking at lies outside the plane; *Image mapping* made that
false, since a picture is allowed to hang off the plane and its resize handles then can't be
reached at a zoom that won't go wider than the plane. A floor is still kept rather than dropped,
so the build can't be zoomed away to an unfindable speck.

Note that drei's `<OrbitControls>` calls `invalidate()` on its own `change` event, so ordinary
user pan/zoom repaints without CameraRig doing anything. Only imperative changes you make
yourself need an explicit `invalidate()`.

### Domino data

`frontend/src/dominoes/` holds the dominoes themselves, separately from the DDObject
hierarchy. It is **generic on purpose** — fields today, walls/towers/lines later — so it knows
nothing about grids, rows or spacing. The parent element decides where its dominoes go; the
subsystem stores them (`object-model.ts`/`store.ts`) and draws them (`modeller.tsx`).

`object-model.ts` defines `DominoData`, a **Structure of Arrays**: one flat typed array per
attribute (`positions` stride 3, `orientations` and `colorIds` stride 1), plus
`count`/`capacity`. That shape exists because it is what an `InstancedMesh` consumes and because
tens of thousands of dominoes must cost no per-object allocation. `generateDominoes(count)`
allocates and defaults them; `extent(data)` derives a footprint from the dominoes themselves,
which is how an element type *can* report a footprint without duplicating layout maths — though
no type does today, and `fieldElement`'s `bounds()` deliberately reports something else (its
boundary rectangle, which is not the dominoes' bounding box — see *The field's anchor model*).

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

**Hiding a domino is a flag over its `colorId`, not a column of its own.**
`HIDDEN_COLOR_FLAG` (`dominoes/object-model.ts`) is added to the id the domino will return to.
That choice is what makes hiding cost almost nothing: `commitDominoColors`, the clipboard,
`rowColPaste`, history's `dominoColors` undo/redo, `colorMemory`'s survival across a regenerate
and the mode's cancel snapshot all move `colorIds` around opaquely, so every one of them
supported hiding the day it landed with no changes. Three consequences are load-bearing:

- **Painting unhides, and there is no code that does it.** Every write path stores a raw
  `numericId` or `0`, both far below the flag, so assigning any color to a hidden domino clears
  the bit as a side effect. A hidden domino's low bits are therefore frozen — they are what it
  returns to, and only unhiding reveals them.
- **"Visible dominoes of color X" is plain equality on the raw value, and needs no masking** —
  a hidden value can never equal a small `numericId` or `0`. That is the whole implementation of
  the swatch menus' select-by-color skipping hidden dominoes (see *Domino color editing*).
  Don't "fix" those predicates by masking; it would silently reverse the behaviour.
- **Use arithmetic, never `|`/`&`.** JS bitwise operators coerce to signed int32. This flag sits
  below 2³¹ so `|` happens to work today, but a wider one would produce a negative that wraps
  into the `Uint32Array` and then compares false against the unsigned value read back, breaking
  `commitDominoColors`' "already this color" early-out.

**A hidden domino is drawn by discarding its pixels, not by shrinking it.** `dominoes/modeller.tsx`
gives the fill geometry an `aVisible` instanced attribute and patches `dominoFillMaterial`'s
fragment shader to `discard` when it is zero; the outline separately takes a zero `aScale` unless
the domino is selected, so a selected hidden domino keeps the white box that is the only way to
see what you are about to unhide. The alternative — collapsing the instance's *matrix* to zero
scale — is simpler and wrong: `Raycaster` is plain CPU JavaScript that reads `instanceMatrix` and
never sees a shader, so a discarded domino stays clickable while a zero-scaled one does not.
Worse, rubber-band selection reads `positions` directly and would keep working, so the failure
would be the confusing kind where drag-select finds dominoes that clicking cannot.

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
*relative to its anchor* — `(row - originRow + CELL_ID_BIAS) * CELL_ID_MULT + (col - originCol +
CELL_ID_BIAS)`, the bias being there because `originRow`/`originCol` go negative once those edges
shrink past the anchor (see *The field's anchor model*). Only the *decode* from `flatIndex` to the
live `(row, col)` depends on the field's current `dominoes_per_row`; the anchor-relative meaning
laid over it never does, which is what makes an id survive a resize. A future spiral/rings type
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
directly without going through a regenerate — `commitDominoColors` (`dominoes/appStoreSlice.ts`'s shared write
path, covering the swatch paint, the unassign, hide/unhide, cut, and paste alike) and the
`"dominoColors"` cases of `undo()`/`redo()`. Routing every colour write through
`commitDominoColors` is what keeps that list at three even as the number of *writes* grows — the
unassign clear, then hide and unhide, were all added later and each inherited the sync for free,
which is exactly the property to preserve. This exists because
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

- **Nothing ever compacts or swap-removes a buffer**, so **a domino's index is stable for the
  life of its parent**. The operation/undo stack depends on that: an op names "domino 4812" and
  stays valid across any undo/redo. There was once a `hidden: Uint8Array` tombstone column
  reserving this for a per-domino delete; it was removed, having accumulated six read sites and
  never a single writer. When a delete does land it must pick its own representation and uphold
  index stability the same way — the drawing half still has the mechanism it needs, since the
  outline's `aScale` collapses an instance to nothing at zero and the fill's matrix does the
  same. Do not reintroduce a column speculatively.
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

**The fill material's `polygonOffset` is load-bearing, not a tweak.** A domino's outline lies
exactly on the boundary of its own top face, so wherever a line covers fill rather than
background the two tie the depth test, and which wins a tie is nothing but draw order. With
gaps between dominoes that only costs the inner half of each line and goes unnoticed; the
moment dominoes touch — expanded (*Domino editing mode*), or a field whose spacing is zero —
every shared edge disappears into the neighbour's face and the field renders as one solid
block. Offsetting the *fill* away from the camera fixes it at any camera angle. Nudging the
outline toward the camera in +Z would too, but only while the view stays top-down, and
`polygonOffset` on the line material is not an option: WebGL only exposes
`POLYGON_OFFSET_FILL`, never a line equivalent.

**`SELECTED_OUTLINE_Z_BIAS` is the same problem one level up**, between two *outlines*. Every
outline in a field is a single instanced draw call, so two dominoes sharing an edge tie there
too, and the winner is simply the higher instance index. Layout is row-major, so the neighbours
above and to the right always win — leaving a selected domino's white box drawn as an **L**,
missing its top and right edges. Lifting a selected instance's `aOffset.z` a hair breaks the tie
in its favour. It is applied to the outline only, never the fill, so a selected domino is never
drawn at a different height than its neighbours. Note the two fixes are not interchangeable:
`polygonOffset` can't separate two lines from each other, and the z-bias can't be given to every
domino (it would just re-tie at the new height).

Per-domino selection and color editing now exist (domino editing mode — see *Domino editing
mode* and *Domino color editing* below), both riding the same `Operation` union DDObject-level
undo/redo already used (see *Undo/redo*), exactly as anticipated when that union was designed.

### Domino editing mode

Double-click a domino-editable DDObject (on the canvas via `SelectionTool.tsx`'s `PickPlane`, or
its row in the sidebar's `DDObjectsPanel.tsx`) to enter it — `store.ts`'s `enterDominoEditing`
sets `dominoEditingId` and switches `activeTool` to `"editDominoes"`, a `ToolId` with **no
toolbar entry** (entry is exclusively by double-click). That one value is deliberately enough on
its own to disarm `SelectionTool`/`CreateByRegionTool`/`onPointerMissed` (none of them match
`"select"` or `"newElement"` anymore) and to swap `Sidebar.tsx`'s child from
`DDObjectsPanel` to `DominoColorPanel` — no scattered `dominoEditingId` checks needed in those
files, and calls `cameraApi.frameDDObject(id)` to fit the field to the canvas (see *three.js /
R3F boundary*) — the one imperative step, hence outside the `set`. The mode is **fully modal**:
the sidebar swaps and the toolbar's Select/New are *replaced* (not disabled) via that same
`activeTool` check, and only `ModeHintBar`'s Done (`exitDominoEditing`) and Cancel
(`cancelDominoEditing`, which discards — see *Undo/redo*) leave it — Escape never does, even
though it clears a lot of in-mode state (see below). Undo/redo stay enabled, clamped by the
barrier rather than disabled.

`designer/DominoEditingTools.tsx` is that replacement group, dropped into `Toolbar.tsx`'s left
`.group` the way `NewElementMenu` is — so `Toolbar.tsx` stays a layout file rather than growing a
branch per mode-specific button. It holds **Select All**, **Invert**, the **Expand** toggle
(below) and the **image mapping** toggle (see *Image mapping*); a `.separator`; the selection-mode
buttons (**Rectangle** plus one per registered shape — see *Shape select*); another `.separator`;
then one `DominoBrushButton` per registered paint brush (see *Paint brushes*). Note Select All and
Invert are raw `<button>`s while the modes and Expand are `ToolButton`s: `ToolButton` always emits
`aria-pressed`, which is right for a toggle or a mode and wrong for a command — the same split
`Toolbar.tsx` already makes between its zoom/undo buttons and the Select tool.

While **colour mapping** is on, **everything in this group except Expand and the image control is
`disabled`** — disabled rather than hidden, unlike the Select/New swap above, so the user can see
what the mode switched off and where it comes back. Both exemptions are explained under *Image
mapping*. Note this is not about a picture being on screen: showing one leaves every tool here
working, which is the whole point of being able to trace over it.

The image entry is `image-map/ImageOverlayButton`, a button plus its own menu rather than a
`ToolButton` — a picture is no longer one thing to switch on and off (see *Image mapping*).

**Both gesture groups grow as variants are registered**, which is why the fixed commands stay
pinned at the front and everything that grows sits behind them. Rectangle stays first *within* its
group because it is that group's null state. Its `active` test is the one thing in this file that
isn't obvious: it must test `dominoShapeSelectId === null && dominoBrushId === null &&
!imageMapActive && !imageTransformActive`, because a null `dominoShapeSelectId` means "no *shape*
armed" and stopped meaning "a drag draws the rectangle band" once a brush could own drags while
leaving that field null — and the two image sub-modes do the same. Without the other tests, arming
any of them lit Rectangle up too and two tools looked armed at once.

**Expand** (`dominoExpanded` in `dominoes/appStoreSlice.ts`) draws every domino oversized so
tightly-spaced ones are easier to hit. Four things about it are deliberate:

- **How much to grow is the element type's own decision**, via `dominoExpansion(ddObject)` on the
  `DDObjectTypeDefinition` — per *side* (`x0/x1/y0/y1/z0/z1`), so a type whose dominoes aren't
  centred in the room around them can grow into the space it actually has. `fieldElement` returns
  half its spacing on each side, which makes an expanded domino span exactly one pitch and the
  field tile edge to edge. Returning `undefined` means "nothing to grow into" and is *also* what
  disables the toolbar button — one member is deliberately both the amount and the capability
  flag, so a new type needs no second declaration.
- **`dominoes/expansion.ts`'s `resolveDominoExpansion` is the single answer** both consumers read:
  `dominoes/modeller.tsx`, which draws the domino, and `designer/DominoEditor.tsx`, which
  hit-tests it. They *must* agree — if the render grows and the rect predicates don't, a rubber
  band visibly cuts through a domino without taking it, and a direct click (which raycasts the
  real, drawn mesh) picks a domino that a drag over the same spot misses. It returns a zeroed
  record rather than `null` so neither per-domino loop needs a branch, and it is **imperative on
  purpose**: it builds a fresh object, so using it as a `useStore` selector is the `useShallow`
  trap. Subscribe to `dominoExpanded`/`dominoEditingId`/`ddObjects[id]` and call it.
- **Growth is per-instance, never a geometry rebuild** — a scale in the fill's `instanceMatrix`
  plus a centre shift, and the vec3 `aScale` on the outline. Rebuilding either geometry would
  remount the `InstancedMesh` on every toggle. The centre shift is what makes asymmetric growth
  work at all, since both geometries are centred on their origin; the same reasoning generalises
  the Z lift to `(length + z1 - z0) / 2`, without which an expanded domino sinks through the
  build plane.
- **It is view state, not document state**: no undo entry, and `exitDominoEditing` clears it
  alongside `dominoSelectedSwatchId`/`dominoColorShortcut`, which is the whole of "leaving the
  mode restores the real sizes." Being view state is also why it is the one tool left enabled
  inside image mapping mode — see *Image mapping*.

**The mode outline is measured off the dominoes, not the element's `bounds()`** —
`modeOutlineRect` puts it `MODE_OUTLINE_MARGIN` outside every domino's drawn footprint, expansion
included, so the gap stays constant whether Expand is on or off. Drawing it on `bounds()` (as it
originally was) both left it flush against the dominoes — a normalised field's boundary rectangle
lands *exactly* on their outer edges, since `requiredSpan` is precisely their drawn span — and let
expanded dominoes overrun it. The trade is that after a handle-drag the outline no longer coincides
with the field's own box, which is correct: the two are different rectangles (*The field's anchor
model*). **`resolveDragToSelection` must keep using `fieldBounds.x/y`**, not this rect, to convert world
coordinates into the parent-relative space `DominoData.positions` lives in — that origin is the
element's `position`, and pointing it at the outline would offset every rubber-band selection by
the margin.

**Three colours carry meaning in the mode, and they are assigned as a set.** White means
*dominoes being taken into the selection* — a selected domino's own outline
(`dominoes/modeller.tsx`'s `SELECTED_OUTLINE_COLOR`), a region gesture that is adding
(`shape-select/preview.ts`'s `SELECT_PREVIEW_STYLE`), and a paint brush's nib, which reads that
same style rather than choosing its own. Dark means *being given back*: an Alt
gesture's `DESELECT_PREVIEW_STYLE`. The frame round the edited DDObject, was originally light 
grey purely but later changed to white because light-gray could not not be seen. This is an unfortunate
collision with the selection color, but it can not be helped. No actual color (e.g. other than black, gray or white), because these colors need to be neutral so as not to bias the user's color selections as they
color their domino DDObject.
Meanwhile, a domino's *unselected* outline (`OUTLINE_COLOR`) is a fourth, darker grey, chosen to clearly
outline the dominoes but to be less intrusive than a fully black outline.

`designer/DominoEditor.tsx` is the canvas tool owning everything once inside the mode. **It was
called `DominoEditTool.tsx`, and the rename is worth keeping**: it has tools of its own — the
selection modes in `DominoEditingTools.tsx`, every shape-select variant and every paint brush — so
"the tools of the domino edit tool" had become an unreadable sentence. It owns per-domino selection
(click / Ctrl+click / Alt+click / drag-rubberband / Ctrl+drag / Alt+drag / arrow-keys /
Shift+arrow-keys, stored in `dominoes/selectionStore.ts`'s `DominoSelectionEntry` — `selected`,
plus `selectionFixedCornerIndex`/`selectionMovingCornerIndex`/`baseSelection` for Shift+Arrow's
Excel-style rectangle grow/shrink/cross-the-fixed-corner behavior) and, layered on top of that,
color assignment (below). **`recomputeFromRect` — Shift+Arrow — is the only reader of either
corner index in the app**; every other site that touches them is merely seeding them for a
Shift+Arrow that may follow, which is why they are named for that role rather than the generic
`anchor`/`active` the spreadsheet convention would suggest. Note a plain (unshifted) arrow does
not read them either: it rescans the whole selection for its extreme domino in the direction of
travel, then reseeds both corners onto where it landed.
Delete hides the selection and Backspace clears it to unpainted, both via `pickDominoSwatch`
(see *Domino color editing*).

**Selection commands that produce a whole set at once — select all, invert, and the swatch menus'
four modes — live in `dominoes/appStoreSlice.ts`, not here**, since a toolbar button and a menu
item both need them. They converge on one module-private `writeDominoSelection`, which is what
guarantees they all set both selection corners identically.
**It finds the lowest index by iterating, never `Math.min(...selected)`** — spreading a `Set`
creates one argument per element and V8 exhausts the call stack around 65k, so Select All on a
250×250 field (62,500 dominoes) crashed. That is the reason the helper exists at all rather than
the line being copied four times.

**Note that selecting dominoes never paints them.** It used to, while a swatch was *locked*:
this helper's last line applied the locked colour, which made Ctrl+A a one-keystroke way to
overwrite a whole field. Locking is gone (see *Domino color editing*), and the only thing that
paints without an explicit swatch click is a paint brush, only while its button is down.

**Ctrl and Alt are one value, not two booleans.** `SelectionGestureMode`
(`shape-select/base.ts`) is `"replace" | "add" | "remove"`, captured into `GestureSequenceState`
at the sequence's first press and threaded to `selectionFrom`. Four decisions here:

- **It is read once and then fixed** — tapping Alt part-way through a drag changes nothing. That
  is what makes it unambiguous for a shape spanning several presses (the `live?.shape` branch
  reuses the same `GestureSequenceState`, so pinning needed no new code), and it is also what
  keeps `sameIndices` correct: a mode that could flip mid-drag would have to invalidate that
  redraw guard, since the same covered indices would no longer imply the same result.
- **Alt is tested before Ctrl**, so both held gives `"remove"`. They ask for opposite things, and
  the preview colour has to agree with whichever wins.
- **Alt+click removes exactly the domino under the cursor, and nothing else.**
  `onPointerUp`'s non-drag path has its own `"remove"` branch ahead of the three other click
  branches, and that branch must stay separate rather than falling through: the branches below
  would replace the whole selection with the single domino clicked — the opposite of what
  someone holding Alt is asking for — and an Alt+click on empty space would clear the selection
  outright instead of doing nothing. Only the clicked domino leaves the selection; the two
  selection corners are carried over unchanged, since nothing was added for a following
  Shift+Arrow to extend from.
  The shape path needs no equivalent: a click while a shape is armed is a zero-radius circle,
  and removing nothing changes nothing.
- **A remove does not change the two selection corners.** `nearestToPoint` picks from `indices`,
  which in a remove are exactly the dominoes that just *left* the selection. It also sets
  `baseSelection` to the surviving set rather than to `before.selected`, or the next Shift+Arrow
  would refill its rectangle from the pre-gesture selection and resurrect what was just removed.
  This is the part of the feature likeliest to be broken by a later "simplification".

**Two rectangle predicates live side by side in that file and must not be merged.** A
rubber-band drag uses `touchedIndices` (footprint *intersects* the box, so a box the user can
see cutting a row takes that row); Shift+Arrow's `recomputeFromRect` uses `enclosedIndices`
(full containment). The difference is not a preference: Shift+Arrow's rect comes from
`rectFromIndices`, whose edges land flush on the two corner dominoes' own boundaries, so an
intersection test there would let neighbours on the far side of a tight pitch bleed in.

**A rubber-band drag previews live**, replacing the stored selection on every pointermove
(`resolveDragToSelection`, shared with the pointerup commit so the two can't disagree). Two
consequences are load-bearing:

- **`resolveDragToSelection` must stay a pure function of the gesture, never of the stored selection** —
  after the first frame the store holds this same drag's own preview, so Ctrl+drag's union
  builds on `GestureSequenceState.before`, the entry captured at pointerdown. Holding that reference is
  a sound snapshot only because every write path calls `replace` with a brand-new entry;
  nothing mutates one in place.
- **Escape mid-drag restores `before`** — a preview that wrote to the store has to be undone by
  `cancelSequence`, which used to have nothing to put back. It covers shape gestures too, which
  preview identically (see *Shape select*).

**A band whose pointerup never arrived is finished by the next press, not thrown away.** Nothing
in this app captures the pointer, so a button released outside the canvas is never delivered and
the gesture is left open. `onPointerDown` therefore has a `live?.dragging` branch, ahead of the
fresh gesture it would otherwise build, that commits the band at the press point and clears the
ref. Four things make that the right behaviour rather than a guess:

- **`onPointerMove` is not gated on the button being down**, so once the pointer comes back the
  band has gone on tracking it. The rectangle on screen at the moment of the press is one the user
  can see, and committing it at the press point commits exactly that.
- **Closing on the press, not the release** — the same idiom oval uses. The trailing pointerup
  arrives with the gesture already gone and is absorbed by `onPointerUp`'s existing
  `if (!g) return`.
- **Without it the press was destructive.** The fresh gesture overwrote the band, and that press's
  own pointerup fell into the plain-click branches: on empty space the whole selection cleared.
- **Escape still backs out**, through `cancelSequence` as always, so there are two ways to end a
  stranded band and neither is a surprise.

`onPointerLeave` is deliberately still brush-only and does nothing for a band. It has nothing to
rescue: the band writes its preview into the selection store on every frame, so leaving the canvas
loses nothing.

`sameIndices` skips the store write when a frame swept nothing new; the modeller's redraw is
per-domino matrix/colour/attribute work, so that integer compare is orders cheaper than the
frame it elides.
Domino hit-testing raycasts directly against the field's `InstancedMesh` via `hitDominoIndex`
rather than through R3F's synthetic pointer-event system, because that system only considers
objects with their own pointer-event props — and the mesh deliberately has none, so
`SelectionTool`'s DDObject-level pick planes underneath it keep receiving clicks (see *Domino
data* above).

### Shape select

`shape-select/` holds the mode's non-rectangular region gestures — five today: `circle`,
`circleByDiameter`, `oval`, `triangle` and `angledRectangle`. It follows the `object-types/` layout
exactly, per the *Guiding principle*:
`base.ts` (the `ShapeSelectDefinition<TState>` contract plus the `AnyShapeSelectDefinition`
erasure), `registry.ts` (the `SHAPE_SELECTS` map and its accessors), `dispatcher.ts` (the shared
algorithm every variant's output flows through), and one folder per variant holding
`object-model.ts` (state shape + pure maths + the definition) and `preview.tsx` (its R3F nodes).
**Adding a shape is a new folder plus one line in `SHAPE_SELECTS`** — the toolbar, the hint bar
and `DominoEditor` are all driven off the map and none of them names a variant.

**Oval is the worked example of a multi-press sequence, and it landed without one line changing in
`DominoEditor.tsx`, `dispatcher.ts` or `base.ts`.** That is the claim the whole subsystem was
built to make good on, so it is worth naming the three things that made it true, since a later
refactor could break any of them without an obvious symptom: `onPointerDown`'s `live?.shape` branch
routes a press into a sequence that is already open rather than starting a new one (which is also
what pins Ctrl/Alt and `before` to the *first* press); `onPointerMove` is deliberately not gated on
`dragging`, so a variant keeps receiving moves with the button **up**; and `runNextStep` clears the
gesture ref only on `"done"`, so a `"release"` returning `"active"` leaves the sequence alive.
Oval's own gesture is press at one **end** → drag to the other end (length and angle) → release →
move (width) → press.

**Snapping both ends of a drag is about getting the angle exact — not about symmetry.** This is the
single most reversible thing in the subsystem, because the symmetry story sounds more plausible and
is wrong. With both ends on the lattice the span between them is a whole number of half-pitches on
each axis, so a drag the user meant to be horizontal lands on *exactly* horizontal and one meant to
be vertical on *exactly* vertical. Before it, axis-aligned ovals came out perceptibly canted and
looked broken; that is the bug two-end snapping fixed.

It costs symmetry, and knowingly. A two-end shape's centre is only *derived*, as the midpoint, and
since snap points sit half a pitch apart that midpoint lands on a snap point only when the two ends
are an even number of half-pitches apart. So `oval` and `circleByDiameter` are not always symmetric
about the domino centres, where `circle` — which snaps its centre — always is. It is also why the
two-end shapes' `controlPoints` return their ends rather than their centre, which can now sit in the
gap between two dominoes.

**That is what makes the two circle variants both worth having**, rather than one being a
convenience: `circle` snaps the centre and guarantees symmetry at every radius; `circleByDiameter`
snaps both ends and guarantees the circle spans exactly between two chosen dominoes. Neither
guarantee implies the other. `circleByDiameter` reuses `circle`'s `CircleSelectState` and
`CircleSelectPreview` outright — a deliberate exception to one-folder-per-variant, since the two are
the *same shape* drawn two ways and a copied containment test would be a second definition of
"circle" with nothing keeping the two in step. Don't generalise the exception: shapes that merely
resemble each other should still each own their maths.

**Every shape snaps points to improve useability** An earlier version of this
file claimed the two polygons deliberately snapped nothing, on the reasoning that a triangle has no
orientation worth squaring up; using them disproved it, and the rule is simply the oval's rule
applied (mostly) everywhere. `triangle` snaps all three corners and `angledRectangle` both ends of its drag
line. `circle` (by radius) is the exception and stays as it is: it snaps its *centre* instead, which is what
buys its symmetry, and its rim is free.

The split is between points that *place* a shape and points that only *size* one. The oval's width
click and the angled rectangle's closing click set sizes, so they stay free; the triangle's third
click places a corner, so it snaps. A triangle with one level side and two ragged ones would look
worse than one with none.

**`SELECTION_MARGIN_MM` (`base.ts`) exists because snapping creates its own artefact.** A snapped
edge lands exactly on a domino's centre, so that domino is precisely on the boundary and is taken
while its neighbours — which the shape may cover 49.9% of — are not, leaving one domino sticking out
of a clean edge. Every shape that snaps carries the margin; `circle` (by radius) again does not, since its
boundary is never snapped to anything. Two rules about it:

- **It goes in `contains`, never in the drawn shape.** A millimetre is small enough to keep a snapped edge visibly passing through
  the dominoes the user picked.
- **Each variant applies it once, where its state is built, never per domino.** The oval folds it
  into its stored inverses; `circleByDiameter` into a precomputed `selectRadiusSquared` (which is
  why its state extends `CircleSelectState` rather than being it); `angledRectangle` into resolved
  `alongMin`/`alongMax` ranges; and `triangle` into a per-edge threshold in `edgeCross`'s own units,
  which is what avoids a division per domino per edge — `edgeCross` returns edge length times
  distance, so "at least 1mm outside" becomes "at least `-1 * edgeLength`".

**`polygonPreview.tsx` draws the shapes that aren't round** — `triangle` passes three corners,
`angledRectangle` four — filling any convex polygon as a triangle fan plus a `lineLoop` outline.
Two things there are load-bearing:

- **`side={DoubleSide}` on the fill.** The order a polygon's corners are listed in decides which
  face the GPU treats as the front, and only the front is drawn by default. Dragging a triangle's
  third corner across the line of the first two reverses that order, so without this the fill
  silently vanishes for half the triangles a user can draw. Circle and oval never hit it because
  `CircleGeometry` always winds the same way.
- **It rebuilds its geometry per frame, deliberately unlike `UNIT_DISC`.** Three or four vertices
  is nothing; a 64-segment disc rebuilt per pointermove would not be.

**A degenerate first stage is the idiom both polygons use, and neither needs a stage check for it.**
Each spends its opening drag with two points coincident — the triangle's third corner still on its
second, the rectangle's width still zero. A polygon with no area selects nothing and draws no fill,
and its outline collapses to exactly the single line that stage is meant to show. So `contains`
needs no guard and `Preview` needs no branch; the maths already does it. The same reasoning is why
the triangle keeps a `stage` field *only* for `hint`.

Two traps oval hit that the next multi-step shape will hit too:

- **The release that ends one stage must not read the next stage's value from that same point.**
  Oval's width is the cursor's sideways distance from its long axis, and at the moment of release
  the cursor is *on* that axis — so reading it there collapses the oval to a flat line the instant
  the button comes up. It keeps the placeholder width and only switches stage.
- **Closing on the press, not the release.** The trailing release then arrives with the sequence
  already over, which `onPointerUp`'s existing `if (!g) return` absorbs. Closing on the release
  instead would leave the shape mutating between the user's press and their release.

Decisions a fresh session would plausibly reverse:

- **The rectangle rubber band is deliberately not a registered shape**, and never will be. It is
  the mode's *default* gesture, active whenever nothing is armed, and it stays in
  `DominoEditor.tsx` where it always was. Its toolbar button means "arm nothing"; registering
  it would make `dominoShapeSelectId === null` and `=== "rectangle"` two encodings of one state.
- **`dominoShapeSelectId` is not a `ToolId`.** `activeTool` is a single slot already held by
  `"editDominoes"` for the whole mode, and seven files gate on that exact value. This is a
  sub-mode *within* it, so it lives in `shape-select/appStoreSlice.ts` and is cleared by
  `exitDominoEditing` alongside `dominoExpanded` — view state, never document state, never
  undoable.
- **Parent-relative mm is the only space a variant sees.** `DominoEditor` converts world →
  parent-relative once (`toLocal`) and re-applies the same offset once, as a
  `<group position={[fieldBounds.x, fieldBounds.y, 0]}>` around the variant's `Preview`. That
  makes the drawn shape and the tested shape *the same numbers* rather than two computations
  that agree; the alternative is each variant subtracting `fieldBounds` itself and one of them
  eventually getting it wrong. (The rectangle band still keeps world and local copies of its
  rect. Fine for one hard-coded shape, not a pattern to repeat five times.)
- **`contains` is a midpoint test, not a footprint one** — and therefore
  `resolveDominoExpansion` is correctly absent from this whole subsystem. The goal is a selection
  that approximates the shape as closely as possible; full-enclosure or any-touch tests both give
  unnecessarily jagged edges. Expand changes how big a domino is *drawn*, not where its midpoint
  is, so a shape takes the same dominoes with it on or off. The rectangle band's predicates do
  consult expansion, because they test against a drawn footprint. Don't unify the two.
- **Snapping is declared by the DDObject and *applied by the variant*.** A type with a grid
  declares `snapShapePoint(ddObject, x, y)` (`object-types/base.ts`); omitting it is the whole of
  "this type has no grid", resolved through `getSnapShapePoint`. `DominoEditor` falls that back
  to `NO_SNAP` and passes it into `nextStep` as a third argument, so a variant calls it
  unconditionally — the same branch-free reasoning as `dominoes/expansion.ts`'s zeroed record.
  It is deliberately **not** pre-applied to `ShapeSelectEvent`'s coordinates: *which* points snap
  is shape-specific, and circle snaps only its centre while letting the rim stay continuous. Two
  things not to reverse: the field's lattice is **half-pitch** (a point on every domino centre
  *and* every midpoint between them, so a circle can sit symmetrically on a domino or on a gap),
  and it is **unclamped** to the field's own rows/columns, because a big circle whose arc merely
  clips the field is centred well outside it and clamping would drag it back onto the boundary.
  The rectangle band is never snapped — its edges already mean what the user drew.
  *Why this fixes lopsided circles:* the centre used to land wherever the cursor was, at a
  different phase relative to the lattice on each side, so the boundary cut a different count left
  and right. On a lattice point the domino midpoints are symmetric about the centre, which makes
  the counts match at **every** radius — which is why snapping the centre alone is sufficient and
  the radius needs no quantising.
- **A click behaves the same whatever is armed, and the tool enforces that — not the variants.**
  `DominoEditor` does not start a shape on the press: it waits until the pointer has travelled
  `DRAG_THRESHOLD_MM`, then feeds the variant a `"press"` whose `origin` is still where the user
  actually pressed. So a press that never moves never opens a sequence, falls through to the same
  plain click / Ctrl+click branches the rectangle band uses, and selects the domino under it —
  followable by the arrow keys like any other selection. The `g.shape` test in `onPointerUp` is
  what routes it there.

  This reverses an earlier decision, deliberately. Preserving single-domino clicking used to be
  each variant's own call via `"ignore"`, and none of them took it, so clicking did nothing useful
  whenever anything was armed. A user cannot be expected to remember which shapes allow a click, so
  the rule belongs in one place. `"ignore"` remains in the contract for a variant that wants to
  decline a *drag*; nothing does today.
- **Arming is sticky**, and **Escape is an escalating ladder** of four rungs: cancel the gesture in
  progress (a shape sequence, a rubber band, or a paint stroke — a stroke reverts every colour it
  laid down) → clear the selection → disarm back to the rectangle band, whether a shape or a brush
  was armed → clear the shortcut buffer. Each press makes exactly one visible change,
  and `"done"` never disarms.
  **The order of the middle two is the whole rule.** Testing the selection *before* the armed shape
  is what makes them separate presses; swapping them collapses both back into one, which is what
  this replaced — so from "circle armed with a selection" it is press one to clear and press two to
  disarm. **Rung 2 applies with a paint brush in hand exactly as without one.** It was once
  skipped there, because a brush's hover footprint *was* the selection and the next pointermove
  put it straight back — a rung making no lasting change, which the one-visible-change-per-press
  property forbids. The hover is its own set now (see *Paint brushes*), so this rung only ever
  sees a selection the user built, and the skip was deleted rather than kept.
  **Escape and the Rectangle button still deliberately differ**: the button is a mode change
  and keeps the selection, Escape is a back-out and ends with it gone; that now takes two presses
  rather than one, but the distinction is unchanged. **The selected swatch is deliberately not on
  the ladder at all** — it is a choice rather than a mode, and it paints nothing by itself, so
  taking it away would only leave a brush inert with no visible reason; leaving the mode clears
  it. Note an *open size menu* claims Escape ahead of all four rungs, in
  the capture phase, so closing a menu never also disarms the tool it belongs to (see *Paint
  brushes*).
- **One catch plane, one gesture-sequence ref.** A second tool component would need its own catch
  plane; whichever sat nearer the camera would swallow `pointerdown` for both, and they would
  hold independent state while `replace`ing the same selection entry. That one plane is
  **always `CATCH_SIZE`**, far past the build plane, so a gesture can be *started* off-plane as
  well as dragged off it — which is what makes a large circle whose arc merely clips the field
  usable, its centre being nowhere near the plane. Two intended consequences: a click far off the
  plane clears the selection exactly as an empty click on it does, and `DesignerCanvas`'s
  `onPointerMissed` becomes unreachable in the mode (it only ever acted for `"select"`, so it was
  already a no-op here).
- **`nextStep` must return a fresh state object.** The dispatcher stores it in React state to
  trigger the preview repaint, and React compares by identity — a mutated-in-place object looks
  unchanged and nothing redraws.
- **`GestureSequenceState`/`ShapeGestureSequence`, not `Gesture`** — a sequence may span several
  presses and releases before the variant calls itself finished.
- **`ShapeSelectEvent` carries no click count.** No shape needs a double click to be distinct
  from two single clicks; a multi-click variant closes on something meaningful instead (clicking
  its first vertex again). If one ever does need a count it cannot come from
  `nativeEvent.detail`, which the Pointer Events spec pins at 0 for pointerdown/pointerup.

`shape-select/preview.ts` holds the drag-preview layer, read by both the rectangle band and every
variant's `Preview` so region gestures can't drift apart visually — the same
one-answer-both-consumers-read idiom as `dominoes/expansion.ts`. It splits in two on purpose: the
z/renderOrder constants are *layering* and never vary, while `ShapePreviewStyle` is *colour* and
comes in two instances resolved by `previewStyleFor(mode)` — white while a gesture is selecting,
dark while Alt is deselecting (see the colour scheme under *Domino editing mode*). The style
reaches a variant as a `Preview` prop rather than being read inside the component, so the contract
in `base.ts` names it and a variant that hard-codes a colour is visibly wrong instead of quietly
showing the selecting colours during an Alt drag. It also holds `UNIT_DISC`/`UNIT_RIM`, a radius-1
disc and matching ring built once for the app and scaled per use — circle scales them evenly, oval
scales x and y differently to squash the disc into an ellipse, and any later round-ish shape wants
the same two. They were private to `circle/preview.tsx` until oval needed them; the alternative was
duplicating 64 vertices and the long comment explaining why they are module constants. Note a
variant's `Preview` draws only the region being swept out; domino outlines are decided per domino
in `dominoes/modeller.tsx` and nothing here touches them. `base.ts` and `preview.ts` consequently
name each other — `base` for
`ShapePreviewStyle`, `preview` for `SelectionGestureMode` — but both are `import type`, which
TypeScript erases entirely, so there is no cycle in the built JavaScript at all and neither file
needs to enter the other. Keep both imports type-only.
`dispatcher.ts`'s `selectionFrom` is the other half of that: the Ctrl union onto the
pre-sequence snapshot and the `nearestToPoint` corner seeding, shared verbatim, which is
what shrank `resolveDragToSelection` rather than duplicating it. `nearestToPoint` exists because a gesture
defines itself by *points* — a band's press/release, a circle's centre/rim, none of which need
land on a domino — while the corners must be domino *indices*; snapping against the gesture's own
result, never all dominoes, is what keeps both corners inside the set just selected.

The toolbar shows the commands first and the modes inline after them (`[Select All] [Invert]
[Expand]` │ `[Rectangle] [Circle] [Circle⌀] [Oval] [Triangle] [AngledRect]`, split by
`Toolbar.module.css`'s `.separator`). **The modes go last because that is the group that grows** —
every shape registered lengthens it, and anything after it would slide along each time. At six or
seven a `NewElementMenu`-style popup becomes right; the buttons are already registry-driven and confined to
`DominoEditingTools.tsx`, so that swap is one file. The part to plan for is that a popup hides
*which* mode is armed, which matters more here than for New — an armed shape changes what every
drag does — so its trigger should render the armed mode's own icon.

### Domino color editing

While in domino editing mode, `Sidebar.tsx` shows `DominoColorPanel.tsx` — a grid of **swatches**
— instead of the object hierarchy. Everything below describes the panel outside image mapping; that
mode gives it two further states, in which it drops the specials and the carets and either does
nothing at all or picks a mapping palette (see *Which colours a run may use*).

**A swatch is anything the panel offers as a click target**, and the abstraction is the point:
`Hide` and `Unassigned` sit above one swatch per **active** domino-inventory entry, and everything
downstream (the selected swatch, the apply, the menus, the highlight) is keyed by `DominoSwatchId`
(`dominoes/swatches.ts`) so none of it branches on which kind it holds. Only three things
distinguish the two specials at all — no hover tip, labels that name keys rather than typeable
shortcuts, and `Unhide` in Hide's menu. The split is store/presentation: `dominoes/swatches.ts`
holds the ids, `designer/dominoSwatches.ts` flattens all three kinds into one `DominoSwatch` view
model so the panel's JSX stays a single code path, and `dominoes/appStoreSlice.ts` holds every
behaviour keyed by id. `background` is a free-form CSS value rather than a hex string specifically
so Hide's hatch and a solid color share one `style` prop.

**`pickDominoSwatch` is the single path for "the user picked this swatch"** — the panel's click,
the shortcut keys and the Delete/Backspace keys all go through it, so they cannot drift. It does
two things, and the split between them is load-bearing:

- **It always records the swatch** in `dominoSelectedSwatchId`. There is deliberately no bare
  setter beside it, so no route can pick a colour while skipping the rest of this.
- **It applies the swatch to the selection**, dispatching to `hideSelectedDominoes`,
  `clearSelectedDominoColors` or `applyColorToSelectedDominoes`.

**It applies with a paint brush in hand too, and there is deliberately no guard against that.**
There briefly was one, because a brush's hover footprint used to be written into the selection
itself, so a shortcut key pressed mid-drawing painted whatever the nib was over and left smears
across the field. The hover is its own set now (*Paint brushes*), so this only ever sees a
selection the user built — and the guard would block precisely the thing it should allow: Ctrl+A
then Backspace to clear a field you have just painted, which is the case the whole split was for.

One consequence worth knowing, since it reads as a bug the first time it happens: using a swatch
click to *load* a brush while a selection is standing also recolours that selection. That is what
a swatch click does everywhere else, and Escape clears the selection first if it isn't wanted.

**Clicking Hide always hides, never toggles**, exactly as clicking Red always paints red; that
is what lets a brush use Hide as an eraser rather than flip-flopping as the nib passes over,
and unhiding is the menu's separate command. Painting a hidden domino
unhides it for free (see *Domino data*'s flag note).

**Those three all became one line each over `applySwatchToSelection`**, which holds the guard
prologue (in the mode, something selected, dominoes exist) and the commit-then-push tail they had
copied between them. Underneath it, `swatchTargets` is the one place that answers *what a swatch
means as a colour write* — Hide adds the flag to whatever colour the domino returns to, Unassigned
is `0`, anything else is the entry's `numericId`. It takes `data` only because Hide's answer is
per-domino where the other two are one value for every index. **A paint stroke shares
`swatchTargets` but deliberately not `applySwatchToSelection`**, since it needs the same swatch
resolution while pushing nothing per frame (see *Paint brushes*).

**Picking a swatch does two things at once**, and that is the whole interaction model. It applies
the swatch to the current selection — immediately, as one undoable `"dominoColors"` operation
(see *Domino data* above for why that's a live color-id reference, not baked-in RGB) — **and** it
becomes `dominoSelectedSwatchId`, the colour a paint brush lays down, marked by the panel's accent
outline. One gesture, both effects; there is nothing extra to do to load a brush.

Three properties follow, each of which a later change could plausibly reverse:

- **A click always selects, never deselects.** Clicking the swatch already selected is a harmless
  re-apply. A toggle would make a brush go inert on a second click.
- **The selected swatch is cleared in exactly one place**, `exitDominoEditing`. Not by Escape
  (see *Shape select*'s ladder), and deliberately not by picking up a brush.
- **`Hide` and `Unassigned` are selectable like any other swatch**, which is the whole of "a brush
  can be an eraser" — no branch anywhere implements that separately.

**The accent outline has exactly one meaning now**, and that is a deliberate narrowing. It used to
be driven by a derived `matchedSwatchId` — "the whole domino selection is this colour" — which was
deleted along with the two version subscriptions feeding it.
Two meanings could not share one outline: at the time, a brush's "selection" was the nib's hover
footprint changing every frame, so a derived highlight would flicker while the colour the brush
paints must stay put. The one remaining override is `shortcutCandidates`, and the two hand off
cleanly — while the buffer is part-typed the candidates outline, and as it resolves and clears,
the outline settles on the swatch that just matched, which is the swatch the match just selected.

**It is drawn on `.swatchRow`, not on `.swatch`** — the row being the swatch and its caret
together. On the swatch alone, `outline-offset` put the ring's right-hand edge in the strip the
caret occupies, and the caret has a background, so it painted over it and the ring came out
visibly open on one side. The row needs its own `border-radius` for this, since an outline follows
the radius of the element carrying it and the row is a plain square-cornered flex box; its two
children hold the rounding.

**A swatch shows pressed-in feedback, in every mode.** Without it, clicking a swatch whose colour
the selection already has produced no visible response at all — nothing on the build plane
changed and the outline was already there — so the click read as ignored. It was briefly gated on
no brush being armed, back when a click under a brush applied nothing; with the guard above gone
there is no such case left, so the gate went with it.

**Two selectors, one declaration** (`.swatch:active, .swatch.pressed`). `:active` is the mouse.
`.pressed` is a brief flash driven from `dominoPressedSwatchId` for a swatch picked from the
*keyboard*, which has no `:active` of its own — a shortcut key that recolours dominoes otherwise
gave no sidebar feedback at all, and one that recoloured nothing looked swallowed. Sharing the
declaration is what keeps the two from drifting apart visually.

`DominoEditor`'s `pickSwatchFromKeyboard` is the only writer: it picks the swatch, sets the
pressed id, and clears it on a `SWATCH_PRESS_FLASH_MS` timer. **`exitDominoEditing` must clear
`dominoPressedSwatchId` as well**, and that is not belt-and-braces: the keydown effect's teardown
clears that timer, so leaving the mode inside the flash window would cancel the un-press and
strand a swatch looking held down for good.

**Two inset shadows, not one**, because a swatch is whatever colour the user's inventory holds: a
wide-spread tint darkens the whole face (what shows on a pale swatch) and a soft shadow cast
inward from the top edge gives the depth (what survives on a dark one). Deliberately neither
`filter` nor `transform` — either one between `#root` and `.sidebar` would break `FloatingTip`'s
`position: fixed`, and putting one on a swatch is close enough to that hazard to be worth avoiding.

There are three ways in — clicking, typing a shortcut, and Delete/Backspace — and they all behave
identically, because they are all one call to `pickDominoSwatch`:

- **Click the swatch**, or **type its `shortcut`** (matches
  narrow live as you type; a unique match applies immediately; Space applies the *exact* match
  when a longer one is also a valid prefix, e.g. disambiguating "B" from "B1"). Shortcut state
  (`dominoColorShortcut`) and its ~1.2s inactivity auto-clear live in `DominoEditor.tsx`'s
  keyboard handler, reusing its existing typing-guard and Escape/pointer-gesture cleanup. That
  handler returns early on any Ctrl/Cmd+key combo before reaching the shortcut-typing branch, so
  Ctrl+Z/Ctrl+Y (undo/redo), Ctrl+C/X/V (the clipboard) and Ctrl+A (select all) all reach
  `DesignerScreen.tsx`'s handler instead of being swallowed as one-letter shortcut buffer
  entries. Keep that early return unconditional: every Ctrl chord in this app is dispatched from
  that one place, which is why both the clipboard and Ctrl+A needed no change to this file's
  keyboard handling at all. Ctrl+A is additionally gated on `dominoEditingId` *there*, so outside
  the mode it falls through without `preventDefault` and the browser's own select-all still works.
  A unique match and a Space-disambiguation each call `pickDominoSwatch`, the same action the
  click does, which is what makes the shortcut a true keyboard equivalent — a brush's colour can
  be changed without reaching for the sidebar.

Clicking a swatch with **nothing selected** applies to nothing, which is a documented no-op — but
it still selects the swatch, and that is the normal way to load a brush.

**Delete hides, Backspace unassigns** — the `DEL`/`Bksp` labels on the two special swatches name
exactly these keys, and both route through `pickDominoSwatch` so they *are* ordinary swatch picks
in every respect: the same undo step, the same `colorByCell` sync, the same empty-selection no-op,
they become the selected swatch, and they apply nothing while a brush is armed. Note the labels
are *not* typeable: the shortcut buffer only ever matches inventory entries' own `shortcut`, so
typing D-E-L does nothing.

**That uniformity is a deliberate reversal.** These two keys once skipped the selected-swatch
half, on the reasoning that they are commands rather than colour choices and a Delete meant to
clear one stray domino should not turn the brush in the user's hand into an eraser. Making them
behave exactly like their swatches won out: one rule is easier to hold than one rule plus an
exception, and the brush guard above removes the sharp edge — with a brush in hand Delete no
longer paints anything, it just points the brush at Hide, which is a visible change the accent
outline shows and another click undoes.

**Every swatch carries a caret opening `DominoSwatchMenu`** — Select /
Add Select / Deselect / Deselect others over the dominoes matching it (`DominoSelectMode`'s
`replace`/`add`/`remove`/`intersect`), plus `Unhide` at the very top for Hide alone. Four
things about it:

- **Matching is plain equality on the stored `colorId`**, which is exactly why a color swatch
  selects only *visible* dominoes of that color and Hide selects exactly the hidden ones (see
  *Domino data*). There is no filter on top of the predicate and there must not be one.
- **Every item here only ever changes which dominoes are selected**, never their colour —
  `Unhide` excepted, which is a command. That was not true while a colour could be locked, and
  it is the property the removal was for.
- **The separator belongs to `Unhide`** and is rendered inside the same `canUnhide` block, or a
  colour swatch's menu opens with a rule floating above `Select` and nothing above the rule.
- **The matching set is built in one pass and then combined**, rather than the modes mutating the
  previous selection inside the loop. `intersect` is why: it has to drop selected dominoes the
  loop never visits, which an in-loop `add`/`delete` cannot express.

The caret is a sibling of the swatch button, not a child — `.swatch` is itself a `<button>` and a
button cannot nest one.

Each swatch's hover text is a `components/FloatingTip`, rendered once at the panel level rather
than inside each button. It must not go back to being a CSS-only absolute tooltip: `Sidebar.tsx`
sets `overflow-y: auto`, which per spec makes `overflow-x` compute to `auto` as well, so the
sidebar clips on **both** axes and the tip is wider than the sidebar. `position: fixed` is the
escape (the same one `DDObjectMenu` documents), and it works only because nothing between
`#root` and `.sidebar` sets `transform`/`filter`/`will-change`/`contain` — don't add any.

Two further routes exist alongside those two, neither belonging to the panel. **Pasting** a copied
pattern of colors (Ctrl+V) belongs to the clipboard subsystem below, and is the only route that can
set many *different* colors in a single operation. **Painting freehand** with a pencil or quill
belongs to *Paint brushes*, and is the only one that writes continuously while recording a single
undo entry.

### Paint brushes

`paint-brush/` holds domino editing mode's freehand painting tools — two today, `pencil` (a round
nib) and `quill` (a thin bar fixed at 45°, lower-left to upper-right). Drag one across the field and
every domino it passes over takes the selected swatch as it goes. Note the two are **labelled**
"Paint with Circle" and "Paint with Bar", and the help topic calls them the Circle and Bar brushes:
the icons draw a nib rather than a drawing implement, and the user-facing names follow the icons.
The registry ids, folder names and `DominoBrushId` still say `pencil`/`quill` — renaming those is
mechanical but wide (two folders, six `PaintCircle*`/`PaintQuill*` icon exports) and has not been
done. It follows the `object-types/`
layout, per the *Guiding principle*: `base.ts` (the `DominoBrushDefinition` contract, the three
sizes), `registry.ts` (`DOMINO_BRUSHES` and its accessors), `coverage.ts` (the shared per-frame
scan), one folder per variant holding `object-model.ts` and `preview.tsx`, plus
`appStoreSlice.ts`. **Adding a brush is a folder plus one line in `DOMINO_BRUSHES`** — the toolbar,
the hint bar and `DominoEditor` are all driven off the map and none of them names a brush. It is
built for the ones after these two (an airbrush is the expected next), which is why pencil and quill
differ in only two members of substance — `contains`, the shape that is *tested*, and `Preview`, the
shape that is *drawn*. **Those two must agree**, for the reason `dominoes/expansion.ts` documents
one level down: if the nib is drawn bigger than it paints, the user sees the shape pass over a
domino it never takes.

**It is deliberately not another entry in `SHAPE_SELECTS`**, and the four differences are what
justify the separate subsystem rather than four optional members only brushes would ever set. A
brush has no gesture *stages* — nothing is dragged out, so there is no `nextStep`, no state object
and no control points (nothing extends a Shift+Arrow out of a stroke). A brush follows the cursor,
so it never snaps to the element's grid. A brush **writes**, where a shape only ever changes which
dominoes are selected. And a brush carries a size menu.

`DominoBrushDefinition` is correspondingly small: `label`, `hint`, `contains(sizeMm, dx, dy)`,
`Preview`, plus `sizeMm` and `sizeIcons` (below). `contains` is a **midpoint test on the domino's
own centre**, exactly as shape-select's is and for the same reason — Expand changes how big a
domino is *drawn*, not where its centre sits, so a brush takes the same dominoes with it on or off.
`coverage.ts`'s `indicesUnderBrush` is a second copy of `shape-select/dispatcher.ts`'s
`indicesInShape` loop rather than a shared generic: the two registries erase different definition
types and their `contains` signatures differ, so sharing would cost more machinery than the eight
lines it saves. Both must stay **ascending**, since `DominoEditor` compares frames elementwise.
A future airbrush will want a per-domino *strength* (`0..1`) here rather than an in/out answer,
since it lays down density; widen `contains` when that lands and can exercise it, not before.

**Millimetres are per brush, and that reverses an earlier decision.** `DOMINO_BRUSH_SIZES` holds
only the size *identity* — which three there are, their order, their labels — because that is what
the store records and what the menu iterates, neither of which needs to know a brush's reach. The
magnitude lives on the definition as `sizeMm: Record<DominoBrushSizeId, number>`: pencil 20/60/120,
quill 60/100/140. The array once carried the millimetres itself, arguing that "Medium" ought to mean
a comparable mark whichever nib drew it. Using it disproved that. 20mm is a useful single-domino dot
for a round nib, but the quill's is fixed at `QUILL_NIB_WIDTH_MM` across, so a 20mm *length* is a
squat blob — too short to show the thick/thin contrast the tool exists for, and barely distinct from
a small circle. The quill's floor sits about where the pencil's middle does. There is no global
`dominoBrushSizeMm` lookup any more, and reintroducing one would re-import the assumption.

**One stroke is one undo entry, and that inverts the rule every other colour write follows.** All
of those write and record in the same breath, which here would mean an undo entry per frame. A
stroke must write live, so paint appears under the nib, yet
record once, so Ctrl+Z takes back the whole stroke rather than one flick of it. Four actions in
`dominoes/appStoreSlice.ts` do it, over `dominoStroke` (the dominoes painted so far and the colour
each had *before*):

- **`paintDominoStroke`** resolves the selected swatch through the shared `swatchTargets` and calls
  `commitDominoColors` like everything else, inheriting the in-place column write, the version bump
  the modeller redraws on, and the `colorByCell` sync. The one difference is the last step: the
  operation it hands back is **folded into `dominoStroke` instead of being pushed**. First value
  seen per domino wins — a nib passing twice over the same domino would otherwise remember what its
  *first* pass left, and undoing the stroke would leave it painted. Safe to call every frame with a
  set the previous frame already covered, since `commitDominoColors` drops any domino already at the
  target colour and returns `null`.
- **`endDominoStroke`** builds one `"dominoColors"` operation from the map and pushes it. Built by
  hand rather than through `commitDominoColors`, because the columns are already written and the
  memory already synced; only the history entry is left.
- **`cancelDominoStroke`** feeds the map straight back through `commitDominoColors` and drops the
  operation on the floor — the same idiom `restoreDominoColorSnapshot` uses, and the reason the
  revert re-syncs colour memory too. Without that, a later regenerate would repaint the very colours
  the cancel discarded.
- **`beginDominoStroke`** opens the map. It and `paintDominoStroke` both bail with no
  `dominoSelectedSwatchId`.

`designer/DominoEditor.tsx` drives all of it, and a brush is the **first gesture in the file that
acts with no button down**. Its branch therefore sits *above* the `if (!g) return` in
`onPointerMove` — that one line is what makes every other gesture a no-op until a press. One
function, `trackBrush`, handles a frame whether hovering or painting: it draws the nib, marks what
the nib covers as hovered, and, when a stroke is open, paints it. Load-bearing details:

- **The paint call goes before the `sameIndices` redraw guard, never after.** The first frame of a
  stroke usually covers exactly what the last hovering frame covered, so a guarded paint would skip
  the press itself.
- **`resetBrushView` runs off `[brushId, brushCanPaint]`, and the derived boolean is why that is one
  effect rather than two.** Arming, disarming, swapping brushes, and a colour arriving where there
  was none are all "what the brush should be showing changed wholesale". Depending on
  `dominoSelectedSwatchId` *directly* would be too permissive twice over: choosing a different
  colour mid-drawing would reset needlessly, and choosing one with no brush armed would reset a
  brush that isn't in hand. Once a guard
  inside the effect filters those out you can no longer tell which dependency fired, which is what
  forced two effects before. Note it resets only the brush's own view — the nib, the stroke, the
  hover — and deliberately leaves the selection alone, which is what lets dominoes picked out
  before a brush was reached for survive being armed.
- **`onPointerLeave` commits a stroke rather than ignoring it.** Nothing captures the pointer, so a
  button released outside the canvas never reaches this component; an earlier version bailed out
  while painting and the brush stayed in painting mode, silently resuming the moment the pointer
  came back with the button long since up. This was a real bug — do not "considerately" re-add a
  guard against interrupting a stroke here. Leaving also clears the hover, which has no nib left
  to belong to.
- **The nib preview sits in world coordinates**, unlike a shape variant's `Preview`, which is
  wrapped in a `<group>` at the edited DDObject's origin. A shape works in parent-relative mm; a nib
  just follows the pointer and is as happy off the field as on it.

**A brush's hover footprint is not a selection, and that separation is the load-bearing thing in
this subsystem.** `dominoes/selectionStore.ts` holds two per-domino sets: `entries` (what the user
picked out) and `brushHover` (what the nib covers right now). `dominoes/modeller.tsx` draws the
**union** of them in white — colour, Z bias and the hidden-domino outline reveal all take the
union, so a hidden domino under the nib shows the same warning box that selecting it does.

They were one set, and every awkward rule the brush needed came from that. Restoring the
conflation would bring all of them back at once, so it is worth naming what the split bought:

- A selection survives being hovered over, so Ctrl+A then Backspace clears a field the way it does
  in any other mode — the case that prompted this.
- A selection survives *arming a brush*, so reaching for one is not a way to lose work.
- `pickDominoSwatch` needs no brush guard, and Escape's rung 2 needs no skip. Both were deleted.
- A swatch click no longer has to fear recolouring a stale footprint, so `onPointerLeave`'s clear
  is ordinary tidiness rather than a correctness fix.

**Only a press to paint discards the selection** (`onPointerDown`'s brush branch), and it sits
*after* the no-swatch early return: an inert brush must not throw away work when pressed.

**`hoverVersions` is a separate counter from `versions`, and must stay separate.** A brush
rewrites its hover on nearly every pointermove, and `DominoEditor` subscribes to `versions` to
rebuild the clipboard handlers whose enablement tracks the selection — one shared counter would
re-register both handlers, and re-render every `useClipboardCapabilities` consumer, at
pointer-event rate. The modeller subscribes to both because it draws both.

**`exitDominoEditing` clears the hover explicitly**, and cannot leave it to `resetBrushView`: that
update nulls `dominoBrushId` and `dominoEditingId` together, so by the time the effect runs it has
no id to clear under and the hover would be stranded — white boxes over a field nobody is editing.

**A brush arms with or without a selected swatch, and is simply inert without one** — no nib, no
hover, nothing paintable, with `ModeHintBar` saying why. The button carries **no disabled
state**, and that is not laziness: what the user has is a colour still to pick, not a broken tool,
and they can only be told that by a button they are allowed to press. Greying it out instead made
the whole feature look unimplemented.

**Arming a brush deliberately does not clear the selected swatch either**, so a brush picked up
while a colour is already chosen paints straight away. Adding a clear to `setDominoBrush` is the
obvious-looking change and it is a trap: `DominoBrushButton`'s size menu calls that action again
for a brush already in hand, so a clear would drop the colour on every size change, and again on
every swap between brushes. Nothing extra is needed to clear the *dominoes* selected on arming —
`brushId` changes, so `resetBrushView` above fires and starts the brush on a clean plane.

`designer/DominoBrushButton.tsx` is one control per brush, and **the button only opens the size
menu; the menu arms the brush.** Clicking an armed brush is therefore not a disarm — it just reopens
the menu, matching every other tool in this toolbar, none of which turns itself off. It carries a
14px caret beside its size glyph saying so — the same caret the New button and the colour swatches
use — marked `aria-hidden`, since `aria-haspopup` already announces it. It borrows
`Toolbar.module.css`'s `.iconBtn`/`.active` rather than keeping a byte-identical copy; what it can't
borrow is `ToolButton`, which takes no ref to anchor a popup to and emits no
`aria-haspopup`/`aria-expanded`.

**The caret's layout modifier, `.iconBtnWithCaret`, lives in `Toolbar.module.css` beside `.iconBtn`
and not in this component's own module.** `.iconBtn` is a fixed 34px square, so the caret needs
`width: auto` and a gap — an override of the same specificity. Across two CSS modules, which one
wins would come down to the order the stylesheets happen to land in the bundle, which nothing pins
down; in one file, after the rule it overrides, it is certain. The popup follows `NewElementMenu`'s pattern, and adds one thing:
an effect that claims **Escape in the capture phase while open**, so closing a menu never also runs
`DominoEditor`'s ladder and disarms the tool underneath. Same answer `ConfirmDialog` uses against
the same window listeners, but for that one key only — a menu is a popup, not a modal, and has no
business swallowing the rest.

**`sizeIcons` is one hand-drawn glyph per brush per size, and every one renders at a single pixel
size.** The drawing carries the size, so scaling a glyph to imply one would double the cue and fight
it — a Small icon rendered small would shrink its own droplet too. There is deliberately no generic
per-tool glyph on the definition: the button shows the size-specific drawing, so one would have no
consumer. See *Hand-drawn icons* for the shared-viewBox rule those six drawings depend on.

### Image mapping

`image-map/` lays a picture over an element. It does **two jobs, and only one of them is a mode** —
which is the distinction the whole folder is organised around, and the one a fresh session is most
likely to collapse back.

- **Showing a picture** is an ordinary overlay of domino editing mode. Every tool keeps working over
  it. This is *tracing paper*: a sponsor's logo laid under the grid, drawn by hand with the shape
  gestures and the paint brushes. It is switched on and off from the toolbar's image button, and it
  is not a mode at all.
- **Mapping its colours** (`imageMapActive`) is a mode. The toolbar's other buttons go `disabled`
  (not hidden, so the user can see what was switched off and where it comes back), the swatches stop
  painting (they choose the run's palette instead — see *Which colours a run may use*), and
  `DominoEditor` gives up its catch plane and its keyboard, keeping only the mode outline.

**The two were one thing, and splitting them was the point of the change.** While the picture only
existed inside the mapping mode, its best use was impossible: showing it meant giving up every tool
that could trace it. If a future change re-ties drawing to `imageMapActive`, that capability goes
with it. The display gates (`modeller.tsx`, `underlay.ts`) therefore test only "is this element
being edited, and does it have a picture it is showing" — no mode is involved, deliberately.

Third-party consequence worth knowing, since it looks like a bug the first time: `underlay.ts`
squashes *unpainted* dominoes so a `"below"` picture draws in front of them, and that now happens
during ordinary editing. It is only a matter of height — the footprint is untouched, so clicking,
rubber-banding and shape-selecting reach a squashed domino exactly as before.

There are now **two** image sub-modes, and they are not alike:

| | What it is | Owns canvas drags? | Exclusive with |
|---|---|---|---|
| `imageMapActive` | the Map Image Colors sidebar | no | armed shape, armed brush |
| `imageTransformActive` | Resize and Move — handles on the picture | **yes** | armed shape, armed brush |

**They deliberately coexist with each other**, since nudging the picture while the mapping panel is
up is exactly what a user wants. Neither is a `ToolId`, for the reason `dominoShapeSelectId` and
`dominoBrushId` are not: `activeTool` is already held by `"editDominoes"` for the whole mode. The
exclusions are each slice's setter clearing the others' fields — an importless cross-slice write,
since `set` is typed against the whole `AppState`.

**`imageTransformActive` is *entered* only from the menu, and that is load-bearing rather than a UI
preference.** `ImageTransformTool` used to keep a canvas-wide plane up at all times, waiting for a
click on the picture. `DominoEditor` has a plane of its own covering the same area at the same
height, and whichever of two such planes sits nearer the camera swallows every press for both — so
the two could never be mounted together, and that is the whole reason the picture could only be
shown in a mode where dominoes could not be edited. With no click-to-enter this tool has nothing to
listen for until the mode is already on, so the two simply take turns: `DominoEditor` mounts its
plane unless either image sub-mode is on, `ImageTransformTool` mounts its own only while Resize and
Move is. **Do not re-add clicking the picture to enter the mode.** It would bring the permanent
plane back and undo the split.

**Clicking *away* to leave is a different thing and is safe**, which is why it exists. That plane
(`DISMISS_Z`, below the move plane and the grips) is mounted only for as long as the mode is, so it
is never up at the same time as `DominoEditor`'s. It works only because `beginDrag` calls
`e.stopPropagation()` — R3F hands a press to *every* mesh the ray passes through unless something
stops it, so without that line a press on a grip would dismiss the mode as well.

Entering Resize and Move also sets `visible: true` — there is no positioning what you cannot see,
and `visible` records no undo entry so it costs nothing.

**Expand is the one tool left enabled** while colours are being mapped, and that is deliberate
rather than an oversight. It changes only how big a domino is *drawn*, which helps line a picture up
against the grid, and a mapping run reads the type's raw `dominoExpansion` rather than
`resolveDominoExpansion` — so what a run paints is identical with the toggle on or off. Keep that
split, or the toggle silently becomes a document-state control. The image button is exempt too, but
for a different reason: transparency and layer are the controls a user reaches for *most* while
lining a picture up.

#### The toolbar control and the sidebar

`image-map/ImageOverlayButton.tsx` is the button plus its menu, sitting where the old
image-mapping toggle sat (right of Expand, in `DominoEditingTools`'s fixed group). Points worth not
reversing:

- **Two buttons, not one.** The icon acts — load a picture, or show and hide the one already there —
  and the caret opens the menu. They cannot nest, since `.iconBtn` is itself a `<button>`; they are
  siblings sharing a wrapper, as `DominoColorPanel`'s swatch and caret are. `DominoBrushButton` has
  one button because there the whole thing opens the menu.
- **The popup is `role="group"`, not `role="menu"`.** A menu's children are supposed to be menu
  items and the inline transparency slider is not one. The slider is also why the popup does not
  close on every interaction — commands close it, the slider does not, which needs no special
  handling since dragging inside the popup never reaches the backdrop.
- **Only New Image is available with nothing loaded.** There is nothing else to do to a picture that
  isn't there.
- **Reset Size** is the only way back from an edge grip, which stretches the picture out of shape
  (only a corner grip holds the proportions). It re-runs `coverPlacement` for the size and keeps the
  picture's **centre**, not its stored `x`/`y` — that is the lower-left corner, so growing out of it
  would shift the picture across the field, and "reset the size" should move nothing. It records
  *after* applying, unlike the delete and replace paths, because the same picture is live on both
  sides (see `recordImageMapChange`). It also brings the picture on screen, as entering Resize and
  Move does — and **both sides of the recorded pair are built from that on-screen record**, not from
  the record as it stands. Recording a hidden original against a visible result would push an entry
  whose only real difference is visibility, and undoing it would appear to do nothing, since undo
  forces any record it writes on screen. Comparing like with like also means a picture already at
  this size records nothing whether it was hidden or not.
- It claims **Escape in the capture phase while open**, so dismissing the menu never also runs
  `DominoEditor`'s ladder or leaves Resize and Move. Same answer `DominoBrushButton` uses.
- Its caret width override lives in `Toolbar.module.css` as `.iconBtnCaretOnly`, **not** in the
  component's own module — the same bundle-order argument recorded at `.iconBtnWithCaret`.

`ImageMapPanel` is correspondingly narrowed to *choosing colours*: its old four-button toolbar and
its transparency slider moved to the menu, it is titled "Map Image Colors", and it carries an `[X]`
that leaves the mode. `ModeHintBar` gains a matching `Close Image Mapping` button at its left, split
off from Done/Cancel by a rule — without the separation the three read as equals and it is far too
easy to press Cancel meaning "close this panel" and discard the whole session.

`Ctrl+I` shows or hides the picture, or asks for one when the element has none. It lives in
`DesignerScreen`'s single Ctrl-chord dispatcher like every other chord, gated on `dominoEditingId`
*before* `preventDefault` so the browser keeps its own behaviour outside the mode. It tests
`!e.shiftKey`, since `key` is lowercased there and Ctrl+Shift+I opens the developer tools, and it
carries the typing guard the rest of that handler does without — unlike the other chords it can fire
with the pointer in the mapping sidebar, which does hold form controls.

#### Where the picture lives, and why it isn't the boundary box

A record's rectangle is stored in mm **relative to the element's `dominoLayoutAnchor`**
(`object-types/base.ts`), never to its `position` or its `bounds()`. Dragging a field's west or
south handle moves `position` while the anchor model deliberately keeps every existing domino where
it is, recomputing their parent-relative coordinates to compensate — so a picture stored against the
box would slide out of registration with the very dominoes it exists to be matched against. A type
declaring no anchor falls back to its `bounds()` corner, which is right for a type whose box and
grid are the same thing; `image-map/object-model.ts`'s `imageOriginFor` is the one place that
fallback lives, and the modeller, the transform tool and the mapping all read it, so the picture
drawn, the picture dragged and the picture sampled cannot be three different rectangles.

The rectangle is free to go negative and to extend past the element — a picture may hang off the
element and off the build plane both, which is what forced the `minZoom` change under *three.js /
R3F boundary*.

#### The "below" layer squashes unpainted dominoes

`layer: "below"` means *above the unpainted dominoes, below the coloured ones*. Every domino is the
same height, so no single height for the picture does both. `image-map/underlay.ts`'s
`resolveUnpaintedTopZ` squashes the unpainted ones instead, and it costs nothing visually: the
camera is orthographic and top-down, so a shorter domino covers exactly the same pixels, and the
only thing that changes is which of them the picture ends up in front of. The picture is
`transparent` with `depthWrite={false}` and `depthTest` on — opaque geometry draws first, so a
full-height painted domino writes depth nearer than the plane and hides it, while a squashed one
does not. No stencil, no draw-order trickery.

`resolveUnpaintedTopZ` is imperative for the same reason `dominoes/expansion.ts`'s resolver is —
subscribe to the values it reads and call it, never call it inside a selector. It is also the one
thing about images that `dominoes/modeller.tsx`, the shared drawing half for every element type,
knows about; keep the signature a plain id in and a number out.

#### Which colours a run may use

`imageMapColorScope` (`"all" | "selected"`) plus `imageMapExcludedColorIds` narrow a run's palette
to swatches the user ticks. `image-map/ImageColorScopeBar.tsx` is the Use Colors dropdown and its
Select All/None, a third sidebar sibling between `ImageMapPanel` and `DominoColorPanel`; on
`"selected"` the swatch panel's buttons become tick boxes. Six things are load-bearing:

- **`image-map/palette.ts`'s `imageMapPaletteEntries` is the single answer both consumers read** —
  `ImageMapPanel`, which greys Map Colors out on an empty palette, and `startColorMapping`, which
  hands the result to `prepare`. The same one-answer-both-consumers-read idiom as
  `dominoes/expansion.ts`, and for the same reason: a greyed-out button and an empty run must not
  disagree about why. It filters `active` too, so a palette that looks non-empty there can never
  come out empty inside `prepare`.
- **Membership is stored as the colours turned *off*.** An empty record means "every colour", which
  needs no initialisation — the slice cannot read `inventoryEntries` while building its own initial
  state — and a colour added to the inventory later starts out included. The positive set would need
  either an init step (fighting the decision that picks are *remembered* across mode entries) or a
  `null`-means-all sentinel, which is two encodings of one state.
- **The narrowing happens before `prepare`, never inside it.** See the colour-distance registry
  below: it composes with Greyscale's own filter, and `resolveDitherAmplitude` measures the narrowed
  palette for free, which is the wanted behaviour — three chosen colours must dither as three.
- **Both fields are settings, not session state**, and `setImageMapActive` deliberately does not
  touch either — unlike `imageMapTargets`, which is re-frozen on every entry.
- **The two special swatches are dropped whenever `imageMapActive`**, via `dominoSwatches`'
  `includeSpecials` parameter rather than a filter in the panel's JSX. Neither means anything to a
  palette, and their absence is also what lets the panel treat every swatch it draws in that mode as
  an inventory entry (the one `as InventoryEntryId` cast in `DominoColorPanel`).
- **Ticked swatches are never dimmed.** The `.inert` dim belongs to scope *All* only; `.noCaret` was
  split out of it because both mapping states draw a swatch with no caret and so need its closed-up
  right edge, while only one of them may hide the colour the user is choosing between. A tick sits
  inside the swatch alongside the accent ring, because the ring alone says "ticked" only by contrast
  with its neighbours, and fails when all or none are ticked.

`Ctrl+A` means the palette inside the mode (`DesignerScreen`'s one Ctrl-chord dispatcher). Selecting
every domino there would light the field up with boxes no tool can act on — `setImageMapActive`
clears the selection on the way in precisely because nothing in the mode uses it.

#### The colour-distance registry

`color-distance/` follows the usual four-part accessor shape (map → `Id` → `_LIST` → `get`), with
**one file per metric rather than one folder**: a metric is pure arithmetic with no preview
component to keep beside it. Maths two metrics share gets its own module beside them —
`linearRgb.ts` (sRGB bytes → linear light), `lab.ts` (CIELAB) and `oklab.ts` (OKLab) are not
registered variants.

**A metric is three stages, and the middle one is the one a fresh session would drop.** `prepare`
runs once per run and depends only on the inventory; **`sample` runs once per domino** and depends
only on the colour being asked about; `distanceTo` runs once per candidate per domino and is
arithmetic. `nearestColor` is what enforces it, calling `sample` outside its own loop. Folding
`sample` back into `distanceTo` looks tidier and silently multiplies the conversion by the number of
active inventory colours — which is exactly what the original code did, unnoticed while CIELAB was
the only metric doing real work.

`prepare` both filters the inventory and precomputes per colour, which is what makes Greyscale an
ordinary metric rather than a special case somewhere else — the only thing that distinguishes it is
which colours are on the table. **"Only use the swatches I picked" narrows the *entries* before they
reach `prepare` rather than widening this contract** (`image-map/palette.ts`, below), so a metric's
own filter composes on top of it and not one metric changed when that landed. Don't move the
narrowing inside `prepare`: five metrics would each have to reimplement it, and it would then be
invisible to `resolveDitherAmplitude`, which is handed the prepared candidates.

Five metrics today. **OKLab is the default and CIELAB is kept beside it deliberately** — the two
mostly agree and part company in the deep blues, where CIELAB's hue drifts towards purple as a
colour darkens; keeping both lets a picture be judged rather than argued about. **`valueWeighted` is
built on OKLab, not CIELAB, and the choice is load-bearing**: OKLab's lightness runs 0..1 and its
colour axes reach about the same magnitude, so `VALUE_WEIGHT` is the whole of the bias with no scale
correction. Ported to CIELAB, whose lightness runs to 100, the same constant would mean something
entirely different.

**`linearRgb.ts`'s `toByteIndex` is load-bearing and its absence fails silently.** Callers
legitimately pass *averages* of pixels, so a channel is `137.42` rather than `137` — and dithering
then adds an offset on top — and reading a typed array at a fractional index gives `undefined`, not
a rounded or interpolated value. Every Lab component then becomes `NaN`, every distance becomes
`NaN`, `NaN < best` is false for every candidate, and the nearest-colour search returns nothing and
paints nothing, with no error anywhere. This shipped once and cost a debugging session: Perceptual
and Greyscale mapped nothing at all while Weighted RGB worked, because that one never indexes
anything. **TypeScript cannot catch it** — a typed array's index signature is `number` whatever the
index is. Any lookup table added here needs the same guard. Its *clamping* half is what makes a
dither offset safe to add before the conversion rather than after.

#### The patch-sample registry

`image-map/patch-sample/` decides how the patch of picture a domino covers is reduced to the one
colour the metric is asked about — `average`, `dominant`, `dominantMerged`. Same four-part accessor
shape as `color-distance/` and `dither/`, with what variants share in its own module:
`patchBounds.ts` (the clamp-and-round every caller runs first, so no variant range-checks anything)
and `buckets.ts` (the bucketing, tally and chosen-bucket re-average the two dominant variants share).

**It lives under `image-map/` rather than at the top level beside the other two**, and that is the
distinction to preserve: a colour metric and a dither are ideas about colour that would mean
something without a picture, where reducing a rectangle of pixels means nothing without one.

**Average and dominant are not better and worse — they are for the two kinds of picture, and each
is visibly wrong on the other's.** `average` is right for photographs. The dominant pair is right
for flat artwork, because anti-aliasing puts a fringe of blended pixels along every edge, and a patch
straddling one averages to a colour that exists in neither region it separates — the mapping then
faithfully finds the nearest inventory colour to a shade that was never in the picture, which is
where the ring of yellow dominoes between an orange region and a white one comes from. The same
thing happens with no anti-aliasing at all wherever an edge falls part-way across a domino. Run
`dominant` on a photograph, though, and no bucket holds a real majority, so the winner is close to
arbitrary and neighbours jump about. Neither behaviour is a defect to be smoothed away.

Four implementation points worth not reversing:

- **The dominant variants count *buckets*, not colours.** Counting exact RGB values cannot work:
  along an anti-aliased edge every pixel is a different blend, so everything ties at one vote. Five
  bits per channel (a step of 8) is coarse enough that a region's pixels land together despite JPEG
  noise and fine enough that two visibly different colours never share a bucket.
- **They then re-average the winning bucket's own pixels** rather than returning the bucket's
  centre. The buckets are for *counting*; quantising the answer to a step of 8 per channel is enough
  to push a borderline domino onto the wrong inventory colour.
- **The scratch tables are module-level and cleared by walking only the buckets used**, never
  reallocated and never wholly cleared. 32768 entries rebuilt or zeroed per domino would cost more
  than the entire rest of the run. Shared mutable scratch is safe here for the same reason
  `dominoes/modeller.tsx`'s scratch matrix is: one patch is processed start to finish before the
  next begins, on one thread. `releaseTally` is the promise that every array is all zeroes again
  before the next patch, and a variant with scratch of its own (`dominantMerged`) clears it over the
  same used-bucket list before calling it.
- **`dominantMerged` exists because a fixed grid splits piles that land on its edges**, and that
  was a reported bug rather than a hypothetical: a stray domino or two in the middle of a flat band,
  landing somewhere different each time the picture was nudged. A region whose colour sits on a
  boundary has its pixels halved between two buckets and a smaller, better-centred pile wins. It
  joins buckets that are **both occupied and adjacent** (all 26 neighbours, since brightness noise
  moves all three channels together) into groups and takes the heaviest group. Two properties make
  that safe where a blur would not be: an empty bucket never joins anything, so two piles with a gap
  between them stay apart; and adjacent buckets differ by 8–14 out of 255, far below what any
  inventory distinguishes. **Overlapping votes — each pixel voting for a 3×3×3 neighbourhood — is
  the more obvious fix and is worse**: 27 increments per pixel instead of one, and it smears across
  24 bytes whether or not anything is there to join.

**Mapping the whole picture first and downscaling afterwards is the obvious-looking alternative and
is wrong**, so it is worth recording why before someone re-proposes it: it would destroy the
dithering. The dither pattern's whole purpose is to be at *domino* resolution, and applying it per
pixel and then reducing averages it away to noise — so the dither has to come after the reduction,
and the pipeline cannot be reordered. It is also the same computation done more expensively (a
full-resolution intermediate and millions of nearest-colour lookups instead of tens of thousands),
and it would need a quantised colour cache to be fast at all, which is most of the bucketing
machinery again with an extra pass bolted on.

#### The dither registry

`dither/` is the second stage of the colour choice and a registry of its own: `base.ts`,
`registry.ts`, three shared-maths modules that are **not** variants (`ordered.ts` for the Bayer
matrix, `pattern.ts` and `diffusion.ts` for the two kinds of dither), and one file per registered
entry — `none`, `bayer4`, `bayer8`, `random`, `floydSteinberg`, `atkinson`. Same four-part accessor
shape, same one-file-per-variant rule as `color-distance/` and for the same reason.

**It is a separate registry from colour distance, not a member on it.** A metric answers *which
inventory colour is nearest to this one*; a dither changes *which colour gets asked about*. Every
dither composes with every metric, so merging them would give a dropdown of every combination.

**There are two kinds of dither and the contract's whole shape follows from the second.** A
*pattern* (the two Bayers, `random`, and `none`) works its shift out from the domino's grid position
alone. *Error diffusion* (`floydSteinberg`, `atkinson`) measures how far each domino actually missed
and hands the shortfall to dominoes it has not reached yet — so it carries state for the length of a
run, has to be told what each domino came out as, and has to see them in a fixed order. Hence
`DitherDefinition` is `{ id, label, scanOrder, createRun(context) }` and the answering happens on a
per-run `DitherRun` (`colorShiftAt` / `recordChoice`) rather than on the definition.

The contract was deliberately stateless until diffusion existed to exercise it, per the standing
rule against reserving machinery speculatively (the `hidden: Uint8Array` column that gathered six
readers and never a writer). This is what widening it actually cost: a pattern variant is still one
line, because `pattern.ts` supplies the empty `recordChoice` and the `scanOrder: "any"`.

Nine decisions worth not reversing:

- **`AnyDitherDefinition` is still a plain alias, not an `any` erasure**, unlike
  `AnyColorDistanceDefinition` and `AnyShapeSelectDefinition`. A run's state hides behind the
  `DitherRun` interface instead of surfacing as a type parameter on the definition. Keep it that
  way — a variant wanting its state in the type would put `any` back in the registry.
- **A pattern supplies one scalar; only diffusion moves channels independently.** Adding the same
  amount to red, green and blue moves a colour along the light-to-dark axis, which is what makes a
  pattern read as a blend between two inventory colours. Independent per-channel *noise* shifts hue
  too, and against a scattered handful of inventory colours — rather than a regular colour cube,
  which is what classic per-channel dithering assumes — that scatters dominoes into unrelated hues;
  it also keeps dithering meaningful under Greyscale, where a hue nudge could not change the answer
  at all. **`pattern.ts` is what enforces this rather than leaving it as a rule to remember**: a
  pattern variant hands over a `PatternAt` returning one number and has no way to express three.
  Diffusion is the exception and earns it — its amount is a *measurement* of how the last choice
  missed, not invented noise, and passing it on is self-correcting (overshooting red makes the next
  domino pick something less red). That is exactly what lets red and blue dominoes average into a
  purple the inventory does not hold.
- **`base.ts`'s `scanRunsForward(row)` is the single definition of serpentine order, and it has two
  readers that must agree**: `image-map/mapping.ts` when it sorts the dominoes, and a diffusing run
  when it decides which side of a domino is "ahead". Both derive it from `row` alone rather than
  counting rows as they go, specifically so a row with no targets in it cannot put them out of step.
  If they ever disagree, half the rows hand their shortfall to dominoes already finished with.
- **The 0-255 clamp in `mapping.ts` *is* the runaway guard — do not add a second cap on carried
  error.** A neutral-only palette asked for a saturated colour would otherwise accumulate chroma it
  can never discharge. Clamping the colour that gets *asked about* stops it at the source: once a
  channel is pinned at an end, the shortfall measured against it cannot keep growing. (The clamp is
  applied for every dither, not just diffusion. It changes nothing for four of the five metrics,
  which already clamp inside `linearRgb.ts`'s `toByteIndex`.)
- **Diffusion ignores the measured amplitude, and that is not an oversight.** `resolveDitherAmplitude`
  returns `0` for a palette the grey ramp cannot tell apart — red and blue only, say — which
  correctly silences the patterns, there being no lightness axis to nudge along. Diffusion still
  works there, because its shortfall is measured rather than scaled from the palette. Feeding the
  amplitude into the diffusion path would break exactly that case.
- **The shortfall stopping at a hole is a decision, not a gap.** A run only visits the dominoes it
  may colour, so error aimed at a hand-painted one lands in the buffer and is never read. Three
  reasons it stays that way: the natural order of work is to map a blank field *first* and paint on
  top afterwards, so there are rarely holes when mapping runs; a region deliberately outside the
  picture is arguably right to be a hard edge; and diffusion flowing *around* an obstacle is a usable
  effect. An earlier version of this file anticipated "measure through them" as the obvious next
  step — it is an option not taken, and it would cost a full-grid scan instead of a target-list one,
  a third method on `DitherRun`, sampling the picture for dominoes the run will not colour, and a
  large false shortfall wherever the hand-painting disagrees with the picture.
- **`none` is a registered entry**, deliberately unlike shape-select's Rectangle. Rectangle is
  excluded there because `null` already encodes it and two encodings of one state is a bug waiting
  to happen; here the value backs a `<select>`, whose value is a string, so a `DitherId | null` would
  put a special case in the store, the panel and the mapping run to save four lines.
- **`random` hashes `(row, col)` and must never call `Math.random()`.** A run has to be
  reproducible, or pressing Map Colors twice gives two different fields and comparing a metric or a
  strength setting becomes impossible.
- **`diffusion.ts`'s ring of error rows takes its depth from the weights**, `1 + max(rowsAhead)`,
  and must not be fixed at two. Floyd–Steinberg reaches one row ahead and Atkinson two, so a
  hard-coded pair of rows would silently drop Atkinson's last weight — it would still map, still
  look like dithering, and just be a slightly wrong kernel, which is the worst kind of bug to
  notice. Holding only a few rows rather than the whole field is itself sound for a reason worth
  keeping in view: a weight only ever points *forward*, so once a row has been walked nothing can
  add to it again.

Both kinds are indexed through the type's own `dominoRowCol` — already contracted to be
*structurally* meaningful, so adjacent dominoes differ by 1 in exactly one coordinate — which is
what makes dithering correct for a polar element type as readily as for a field, and makes a type
declaring none simply get no dithering. That adjacency is load-bearing twice over now: a pattern
needs it to land on the dominoes, and diffusion needs it to hand a shortfall to the domino
physically next door. Note a Bayer repeat is a **rectangle** on the ground, since a field's X and Y
pitch differ; indexing by row/col is still right.

**A *pattern* variant returns only the pattern — a unit value in `[-0.5, +0.5)` — and knows nothing
about bytes.** How far to push it is `image-map/ditherAmplitude.ts`'s
`resolveDitherAmplitude(metric, candidates)`, measured **once per run from the palette**, and the
slider is a multiplier on that. So the amplitude lives at the seam between the two registries rather
than in either, `dither/` never imports `color-distance/`, and a new pattern cannot disagree with the
existing ones about how hard to nudge.

**The strength slider means the natural thing in each kind, and `mapping.ts` no longer multiplies
the two together.** `ColorMappingSettings` carries `ditherAmplitude` and `ditherStrength`
separately, because a pattern scales its pattern by both while diffusion ignores the amplitude and
uses the strength to decide how much of its shortfall to pass on. At 0 both do nothing, which is
what keeps "0% is identical to None" true without a special case.

**`mapping.ts` does a grid pre-pass at job creation**: every target's row and column into two
`Int32Array`s, the column range for the run context, and — only when the dither asks for it — a
`Uint32Array` sorted into serpentine order. It is a small win even for the patterns, saving the loop
a call and a fresh `{row, col}` object per domino. The chosen colour's RGB, which diffusion needs to
measure against, comes from `colorLookupStore.ts`'s `rgbById`, **snapshotted into
`ColorMappingSettings` by the caller** alongside `candidates` — deliberately not by widening
`PreparedColor` with three fields four of the five metrics would never read, and snapshotted rather
than read live because a run spans many frames and an inventory edit must not shift the table
underneath it.

**Measuring it is not optional tuning — a constant is wrong by construction**, and this shipped
once. `MAX_DITHER_AMPLITUDE_BYTES` was a flat `64`, which is exactly right for a five-level palette
and wrong everywhere else: the textbook ordered-dither amplitude is `255 / (N - 1)`, so a
black-and-white inventory wants `255` and a forty-colour one wants about `7`. With black and white
the symptom was a photograph coming out as a plain threshold — Greyscale's only boundary is
L\* = 50, sRGB byte 119, and a ±32 nudge can only flip patches averaging 87–151, a quarter of the
range. The other direction was invisible but real: a full inventory was being over-nudged ninefold,
which is why the slider had to be kept low there.

**The measurement is a grey-ramp probe, and asking through `nearestColor` is the whole trick.** It
walks `v` = 0…255, asks the *selected metric* which candidate wins for `(v, v, v)`, and counts the
distinct answers — so Greyscale, which throws most of the inventory away in `prepare`, measures a
much coarser palette than OKLab does over the same inventory, and switching metric re-measures with
no extra code. Reading the inventory directly instead would need each candidate's RGB on
`PreparedColor` — widening a type four metrics implement, to compute a worse answer that ignores
which colours the metric will actually use. (Error diffusion *does* need a chosen candidate's RGB,
and gets it from `colorLookupStore.ts`'s `rgbById` for the same reason — the two agree deliberately,
so don't resolve the apparent tension by putting RGB on `PreparedColor` after all.) It costs 256 lookups per run and is computed
unconditionally; branching on `ditherId === "none"` to skip it would put registry knowledge back in
the caller to save microseconds. Fewer than two distinct winners returns `0`, so the caller
multiplies and needs no branch — the same idiom as `dominoes/expansion.ts`'s zeroed record and
`NO_SNAP`.

It measures how finely the palette divides *lightness*, which is the axis a **pattern** moves a
colour along, and is therefore an estimate for a palette of strong colours, which divides lightness
differently at different hues. That is what the strength slider sits on top of. The panel's range
stops at 100% because past one full palette step a domino takes colours that are not adjacent to its
true one — scatter, not blending — and full strength is the textbook half-step rather than an
aggressive setting, so `DEFAULT_DITHER_STRENGTH` is free to sit wherever it looks best without any
of this needing to change.

**Note the whole of this only concerns the pattern dithers.** A diffusing one never reads the
amplitude (see the fifth bullet above), so nothing here bounds what Floyd–Steinberg or Atkinson do,
and the strength slider means something different to them — how much of the shortfall is passed on.

#### Mapping

`image-map/mapping.ts` is a chunked job driven from an animation frame in the slice, reusing the
**paint-stroke idiom verbatim**: write live so the field visibly fills in, record once, as a single
`"dominoColors"` operation. Cancel feeds the before-map back through `commitDominoColors` — not
straight into the column — so the revert re-syncs colour memory, exactly as `cancelDominoStroke`
does.

**Which dominoes a run may colour is decided once, when the mode is switched on, and handed to
`createColorMappingJob` as an explicit list** — `imageMapTargets[parentId]`, a `Uint32Array` of the
indices whose `colorIds` were `0` at that moment. `mapping.ts` never inspects a colour and has no
eligibility rule of its own.

This replaced a rule that inferred eligibility per run — `colorId === 0`, *or* the domino still held
exactly what the previous run left (a `lastMappedColors` map). That worked, and the reasons it was
dropped are worth recording, because it is the more obvious design and would be re-proposed:

- It compares against a *moving* target once dithering exists, since a dithered and an undithered
  run of the same picture give the same domino different colours.
- Freezing the set states the user's intent rather than inferring it: *these* are the dominoes on
  offer. Anything hand-painted is excluded structurally — it was not blank at capture — instead of
  by a colour comparison that happens to fail.
- It gives leaving and re-entering the mode a meaning: the fresh capture excludes what was just
  mapped, so a toggle **commits** a result. There was no way to express that before.

Four consequences, each load-bearing:

- **`imageMapTargets` is written only on entry and never cleared on exit.** `imageMapActive` is set
  `false` from five places (its own setter, `exitDominoEditing`, and the cross-slice writes in
  `shape-select` and `paint-brush` that enforce the three-way exclusion), and a field needing to be
  cleared in all five will eventually be missed in one. A stale entry is unreachable while the mode
  is off and is overwritten on the next entry. Only `discardImageMapSession` drops it — from
  `cancelDominoEditing` and from `initImageMapPruning`, where the element's whole session is over.
  Note `clearImageMap` (DEL on the picture) deliberately does *not*: the target set belongs to the
  session, not to the picture.
- **`colorIds[i] === 0` needs no masking**, the same property the swatch menus rely on: a hidden
  domino is at least `HIDDEN_COLOR_FLAG` and a painted one is a small `numericId`, so one equality
  excludes both.
- **A run clears its whole target set to `0` before mapping into it**, folded into the same
  `before` map the chunks write to, so the clear and the mapping land in one undo entry. Not
  redundant with the mapping overwriting each domino: a run leaves a domino alone where the picture
  does not reach or is transparent, so without the clear, moving the picture and mapping again would
  strand the previous result outside the new footprint. `clearMappedColors` (the panel's Clear) is
  the same write on its own.
- **A domino's patch comes from `getDominoExpansion`**, the type's own statement of how much room
  each domino owns, via `dominoes/footprint.ts`'s `dominoFootprintHalfExtents`. For a field that is half
  the spacing on each side, which makes the patch exactly
  one pitch in each axis — note `thickness` goes with X and `width` with Y, matching `pitchX`/
  `pitchY`, which is the part that would be easy to get backwards. So the patches tile the grid
  exactly in millimetres and the whole scan visits each source pixel about once. (`resolvePatchBounds`
  then rounds *outward* to whole pixels, so neighbouring patches share up to one pixel row and column
  at each seam. That is the right way round — a gap would silently lose pixels — and it is negligible
  until the picture is low-resolution relative to the field, since the decoder only ever downscales.
  At a couple of pixels per domino a patch is mostly its neighbours, which hurts the dominant
  samplers far more than the average.) Reading the whole patch rather than the single pixel at its
  centre is what stops a detailed picture turning into speckle; *how* it is read is the patch-sample
  registry's business, not this file's.

**How many dominoes a run will fill is told to the user up front**, because neither reason it can be
zero is visible on the screen: a field of coloured dominoes looks perfectly mappable, and a picture
parked off to one side looks fine too. Without it the first sign of trouble was pressing Map Colors
and watching nothing happen. Three parts:

- `image-map/coverage.ts`'s `makeDominoUnderImageTest` builds the "does the picture reach this
  domino" test once and then answers it in a few comparisons per domino. It shares
  `dominoFootprintHalfExtents` with `mapping.ts` **specifically so the count and the run cannot disagree
  about what the picture covers** — a count that contradicted the button would be worse than none.
  (That helper lived here, as `dominoPatchHalfExtents`, until *Build plans* needed the same answer.
  It is not about pictures — it is "how much build plane does a domino own" — so it moved to
  `dominoes/footprint.ts`, where a third consumer can reach it without importing from `image-map/`.)
  The **geometry is exact**, and it is worth knowing why rather than assuming it is approximate:
  `resolvePatchBounds` decides a patch misses the picture *before* it rounds outward to whole
  pixels, and that decision, with the mm-to-pixel factors cancelled, is literally this overlap test.
  The rounding picks which pixels a reaching patch reads, never which dominoes it reaches.
  **Transparency is the one thing this does not know about**, and it is not an edge effect: a
  sampler returns null below `MIN_OPAQUE_FRACTION`, so artwork on a transparent background covers
  far more dominoes by rectangle than a run actually colours. Closing that gap means summing alpha
  over the whole pixel buffer, which is affordable once but not while the picture is being dragged —
  hence a deliberate limit rather than an oversight.
- `setImageMapActive(true)` counts as it walks the dominoes to build `imageMapTargets`, and sets
  `imageMapEntryWarning` — `"all-colored"` or `"no-dominoes"`, told apart because they need
  different advice. Decided on entry and **only** on entry: a modal appearing mid-drag would be its
  own kind of awful. **Closing its dialog leaves the mode**, which is why the flag needs no clearing
  action of its own: with nothing to map, every control in the panel is pointless, and leaving is
  the fix in both cases since coming back takes a fresh target list.
- The panel's `{n} Unassigned Dominoes (?)` counts the **frozen target set** narrowed to what the
  picture reaches, never the colours the dominoes currently hold. A live count would drop to nothing
  the moment a run finished and read as though the tool had stopped working. That is also why its
  `useMemo` needs no subscription to the domino data's version: inside this mode the ordinary tools
  are off and the element cannot be resized, so of the three things it reads only the picture moves.
  It is **shown only when some dominoes under the picture are *not* on the list** — over a field
  with nothing coloured in yet the number would only restate what the user can see, and the `(?)`
  would answer a question nobody had. Hence the memo returns `reachable` and `skipped` rather than
  one figure, and walks all the dominoes rather than only the targets.

`colorMappingProgress` is written **only when a run is about to schedule another chunk**, never at
the start. A run finishing in one frame then shows no bar, which is honest; setting it up front
could not have worked anyway, since React coalesces the `0` and the `null` after it into one render
and the bar was never committed at all for a short run.

#### What is undoable about a picture, and what isn't

The line is **document state versus view aid**, and it is drawn deliberately:

- **Undoable**, as one `"imageMap"` operation: move, resize, reset size, add, delete, and replace.
- **Not undoable**: show/hide, transparency, layer. These are glances, like the Expand toggle.
  Ctrl+I in particular is a rapid toggle, and filling the undo stack with it would bury the edits
  worth taking back.

**An image operation lives only as long as the domino editing session that made it.**
`exitDominoEditing` filters `kind === "imageMap"` off both stacks, and they are gone for good. The
rule behind that is worth stating on its own, because it is new and it generalises: **the
consequence of an undo or a redo must always be visible.** A picture is only ever drawn inside
domino editing mode, so an operation surviving past it could only ever be undone invisibly. Pulling
entries out of the middle of the stacks is safe because an image operation touches nothing but
`imageMaps`, which no other kind reads. It is also what lets the pruner free the megabytes held by
every picture deleted or replaced during the session — that memory is kept alive *by* those entries,
and only by them. (Note the barrier can't be one of the entries removed: it is captured on entry,
and this purge means no image operation is ever on the stack at that moment.)

**The same rule is enforced from the other side, inside `undo`/`redo`**, because a picture can be on
the element and still not on the screen — hidden, or wound to fully transparent. Two halves, and
both are needed:

- `revealBeforeApplying` — if the element's picture is currently invisible, that press brings it
  into view and does nothing else, leaving the operation where it is. One press, one visible change,
  the same rule the Escape ladder follows. This covers *add → hide → Ctrl+Z*.
- `imageMapsWith` forces any record it writes on screen. This covers what the first half cannot:
  undoing the delete of an invisible picture, where there is no current record left to reveal.

`image-map/visibility.ts` holds both tests plus `DEFAULT_IMAGE_OPACITY`, and **is its own module for
one specific reason**: the history slice needs them as *values*, and `object-model.ts` value-imports
`object-types/registry`, an edge that leads back towards `store.ts`. `visibility.ts` imports nothing
but a type, so it is safe to reach from anywhere. Note the transparency test is a literal
`opacity > 0` with no margin — a picture at 1% is faint but genuinely on screen, and a threshold
would quietly overwrite a setting the user chose.

One operation variant covers all five undoable cases — a null `before` is an add, a null `after` a
delete, two records set is a move/resize or a replacement. Splitting them by kind costs an extra
kind for the replacement, which is neither an add nor a delete but both at once.

`cancelDominoEditing` still discards the picture along with the colour edits, while
`exitDominoEditing` (Done) keeps it, so re-entering finds it where it was left.

**Two things about recording are load-bearing and easy to get backwards.**

- **`recordImageMapChange` must be called BEFORE applying a change that drops or replaces a
  picture** — backwards from every other commit point in the app, which record afterwards.
  `initImageMapPruning` frees any decoded picture nothing points at, it runs synchronously on every
  store write, and an operation on the undo stack is one of the two things that counts as pointing
  at one. Clearing the record first leaves a gap, one store write long, in which the old picture is
  referenced by nothing at all — and the pruner takes exactly that moment to free its pixels, so the
  operation lands naming a picture that no longer exists and undoing it restores a blank. A plain
  move or resize is exempt and records afterwards, since both sides name the same live picture.
- **The no-op check is `imageMapRecordsEqual`, never `ddObjectsEqual`.** That helper compares by
  `JSON.stringify`, which is fine for a DDObject and quietly terrible here: a record carries `src`, a
  base64 copy of the original file, often megabytes, and a drag ends every time the mouse comes up.
  `imageMapRecordsEqual` compares the cheap fields first and only reaches `src` once they all match,
  where the two are nearly always the same string in memory anyway.

`ImageTransformTool` mounts four things — a click-away dismiss plane, the picture's move plane, its
grips, and a mid-drag `CATCH_SIZE` catch plane — **all only while Resize and Move is on**. The *one
catch plane, one gesture* rule holds structurally: `DominoEditor` mounts its plane unless an image
sub-mode is on, and this mounts its own only while one is. **Two things about the four are
load-bearing.** Their z order is what decides which one a press belongs to (dismiss below move below
grips, since the camera is top-down and R3F sorts hits by distance), and **`beginDrag`'s
`e.stopPropagation()` is what stops a press belonging to more than one of them.** Without it, R3F
dispatches to every mesh the ray hits: a grip press ran `beginDrag` twice, once for the grip and
again for the move plane underneath, which overwrote the drag with a move — so grips only worked
where they hung off the edge of the picture. That was a real bug, from removing the line on the
grounds that its only job was the plane that had just been deleted. `SelectionTool` has always
called it, which is why its handles have never had the problem.

`assetStore.ts` is a small store of its own, following `colorLookupStore.ts`'s precedent — a cache
*derived* from the data URL in the record, holding a `THREE.Texture` that must be `dispose()`d and a
pixel buffer of megabytes, neither of which belongs in copy-on-write state. It downscales to
`MAX_SAMPLE_DIM`, since even a 250×250 field needs only a handful of pixels per domino.

**It is keyed by the picture (`assetId`, minted `"IMG-{n}"`), not by the element showing it**, and
that is not a tidiness choice. Keyed by element there is room for exactly one decoded picture per
element, so loading a replacement had to throw the old one's pixels away — fine while nothing about
a picture was undoable, and wrong the moment replacing one became an undo entry, since Ctrl+Z would
restore a record with nothing left to draw. The record carries the id; `modeller.tsx` and
`startColorMapping` look up through it.

`initImageMapPruning` is consequently **the only thing that frees anything** — `clearImageMap`
deliberately disposes nothing, because the delete it performs is undoable. It does two jobs on two
keys: a *session* (the record plus its target set) goes when its element is absent from `ddObjects`
and unreachable via `isDDObjectInUndoHistory`, like `colorMemory` and unlike `selectionStore`, since
undoing a field delete must bring its picture back; a *decoded picture* goes when no live record and
no `"imageMap"` operation on either stack names its `assetId`. It watches `imageMaps` as well as
`ddObjects` and both stacks, and iterates the union of `imageMaps` and `imageMapTargets`, because an
element can hold a target set with no picture — the mode was switched on and nothing was loaded.

### Build plans

`build-plan/` produces the documents a design has to become before it can be built. Two are
printed: the **Layout** (a picture of the element, one cell per domino, in colour, with a legend
number in each) and the **Sort Plan** (each row written as run-length runs of colour, for counting
dominoes into stacks in advance). Both are **template-aware** — a template is a comb 10–50 teeth
wide that a row is slotted into and slid into place, so both mark batch boundaries at the template
width, each with its own size setting since there is no reason sorting and setting up use the same
comb. The third, **Export CSV**, is the same layout as data rather than as paper, so a design can
be counted, re-ordered or priced somewhere else.

It follows the `object-types/` layout: `base.ts` (`BuildPlanDefinition<TOptions>` plus the
`AnyBuildPlanDefinition` erasure), `registry.ts` (`BUILD_PLANS` and its accessors), shared
`model.ts`/`planGrid.ts`/`paper.ts`/`html.ts`/`download.ts`, one folder per document, and
`appStoreSlice.ts`. **Adding a document is a folder plus one line in `BUILD_PLANS`** —
`DDObjectMenu` and `BuildPlanDialog` are driven off the map and neither names a plan.

#### How a finished document reaches the user

A plan's `render` produces the document as a **string**, and `actionLabel`/`deliver` on the
definition say what to do with it: the dialog's primary button takes its wording from the first
and calls the second. That pair is what lets a plan be *saved* rather than *printed* with no
branch in `BuildPlanDialog` — the two ways of delivering one live in `html.ts`'s `openPlanTab` and
`download.ts`'s `downloadTextFile`, and a definition just names the one it wants. Three things
about it:

- **Both return `string | null`** — null having worked, or the message to show. The pop-up-blocked
  wording therefore sits beside `openPlanTab`, which is the only thing that can be blocked, rather
  than in the dialog, which no longer knows a tab is involved.
- **Both must be reached synchronously from the click**, and for the same reason: a browser
  allows `window.open`, and trusts a download, only while it can still see the user gesture. The
  whole path — build the model, paginate, emit, deliver — is synchronous by construction.
- **`downloadTextFile` clicks a link the user never sees**, an `<a download>` added to the
  document and removed again. That is the only way to save a file the app made up itself, short of
  the File System Access API, which not every browser has. Its object URL is revoked on the same
  60-second timer `openPlanTab` uses, and revoking early gives an empty file rather than a blank
  tab.

#### It is HTML, and that is not a stopgap

A plan is a whole standalone document — its own `<style>`, no React, no CSS modules, no webfonts —
opened in a new tab from `html.ts`'s `openPlanTab`, and printed by the browser's own dialog, which
is also where the PDF comes from. That was chosen over a PDF library because the print engine
already knows paper sizes, orientation and Save-as-PDF, and a library would mean hand-rolling text
layout and colour fills to get back to where `@page` starts. Four things about it are load-bearing:

- **`print-color-adjust: exact`** (with the `-webkit-` prefix). Browsers drop background colours
  when printing unless asked not to, and without it every domino prints white — the whole document
  gone. It is an inherited property, so `html.ts` sets it once at the top.
- **`@page { margin: 0 }` with our own padding inside `.page`.** Left alone the browser adds a
  margin over ours and every measurement the pagination made is wrong by that much.
- **`.page + .page { break-before: page }`, never a break *after* every page.** A break after the
  last one prints a blank sheet.
- **`window.open` must be reached synchronously from the click.** A pop-up blocker only allows it
  while it can still see the gesture. Everything a plan needs is already in memory, so the whole
  path — build the model, paginate, emit, open — is synchronous by construction; a `false` return
  raises the acknowledge-only `ConfirmDialog`. The URL is a blob (a real, reloadable address, and
  it prints more predictably than writing into `about:blank`), released on a **timer** rather than
  at once — revoking before the new tab has loaded leaves it blank.
- **`planDocument`'s `script` is `{ name, code }`, and the name is not optional.** It becomes a
  `//# sourceURL=` comment, which is what gives the script its own entry in devtools. A plan opens
  from a blob URL, so without it an error reads `77f30707-85d3-…:204` — an opaque id and a line
  counted from the top of the whole generated page. It cannot do better than a name: these scripts
  are template strings in the emitting module rather than compiled output, so there is nothing for
  a source map to point back at. Requiring the name here rather than leaving each document to
  remember it is what stops the next scripted document shipping without one.

**The Layout is drawn as one inline SVG per page**, and that is the answer to "what about spirals
and rings", which would otherwise read as a reason to want PDF. SVG has the same vector primitives
(`path`, arcs, rotated `rect`, text on a path), the browser rasterises it at *printer* resolution,
and it survives Save-as-PDF as vectors. It also makes the thick division rules plain `<line>`
elements: drawn as cell *borders* they would shrink the cells they landed on and make the grid
uneven. What genuinely would not carry over to a non-grid type is page **cutting**, which assumes a
column range maps to a rectangle. That is honest future work.

**Each document is split into `paginate`/`encode` (pure geometry or data, no markup) and
`emitHtml`.** The split is inside each folder rather than on `BuildPlanDefinition`, because that is
where a second backend would go — a PDF writer would consume the same paginated geometry and sit
beside `emitHtml`, with the model, the pagination and the options untouched. Putting it on the
contract would add a second type parameter to every definition for no gain today.

#### `model.ts` — where a DDObject becomes a plan

The one place that reads the domino columns, resolves colours, or decides which way up the page is,
so the two documents can never disagree about a colour number or a row number. It names no element
type. **Two existing sources answer two different questions, and keeping them apart is the point:**

- **`DominoData.positions` plus `dominoes/footprint.ts`'s `dominoFootprintHalfExtents`** answer
  *where a domino is drawn and how big*. The type's own modeller already wrote the positions, and
  the footprint is the room the type says each domino owns. **This is what makes the printed cell
  proportions match the canvas with no ratio computed anywhere** — a field's cell comes out about
  twice as tall as it is wide because that is what it measures. It must use the **raw**
  `getDominoExpansion` and never `resolveDominoExpansion`, which reports zeroes unless the Expand
  toggle is on; a printed plan cannot depend on a view toggle, the same rule a mapping run follows.
- **`dominoRowCol`** answers *what a domino is called* — row and column numbers on the page, where
  the division rules fall, and the order the sort plan walks in.

So a future spiral or ring type needs no new geometry code here. The one real gap is **rotation**:
`DominoData.orientations` is standing/sideways/flat with no angle, so a type whose dominoes turn
would need that column widened.

**Two flips happen in `model.ts` and nowhere else**, and getting either backwards mirrors both
documents: `planRow = maxRow - row`, because `fieldElement`'s row 0 is its *bottom* row and plan row
1 is the top one; and `planY = maxY - (posY + halfUp)`, because the build plane's Y grows up while a
printed page's grows down.

**Colour numbering is `compareColor`**, the inventory table's own Color-column comparator, reused
rather than reimplemented. An id with no live inventory entry resolves to Unassigned — deliberately
the same fallback `rgbById` misses into, so a plan can never show a colour the build plane doesn't.

**Unassigned prints as 0 and the real colours count up from 1**, so the numbers a builder actually
has to go and fetch start at 1. It is pulled out of the sort and listed first rather than left to
land among the greys, and when nothing is unassigned it is simply absent and the numbering starts at
1 with no gap.

**That is why `PlanDomino.colorIndex` and `PlanColor.number` are different things, and they must
stay different.** `colorIndex` is a position in `colors`; `number` is what gets printed. They were
one field until Unassigned took 0 — at which point 0 became a perfectly ordinary colour and could no
longer double as the "no domino here" sentinel. The sentinel is now **`-1`**, which can never be a
valid index. Two consequences worth keeping:

- **Nothing adds or subtracts one.** `colors[domino.colorIndex]` is the whole lookup; the old
  `colors[n - 1]` is gone from both emitters.
- **`sort/encode.ts` needed no parallel "is there a domino here" array** once the sentinel could be
  pre-filled into its grid — a position holding no domino and a hidden one are the same thing to a
  builder, and now the same value.

**That pre-filled grid is `planGrid.ts`'s `planColorIndexGrid`, and it is its own module rather
than a function in `model.ts` for a specific reason.** `model.ts` value-imports
`object-types/registry` and the domino stores, because building a plan means reading them, and
that drags a large part of the app in behind it. Laying an *already built* model out by row and
column needs none of that, and both `sort/encode.ts` and `csv/encode.ts` want it — so it sits in a
module whose only import is a type, which TypeScript erases entirely. Same reasoning as
`image-map/visibility.ts`. `PLAN_GAP` lives there with it, so the two encoders cannot disagree
about which value means "nothing here". (`layout/emitHtml.ts`'s `indexByRowCol` stays separate: it
holds whole `PlanDomino`s, which is a different payload, not a fourth copy of this.)

#### Legibility drives capacity, not the other way round

The number in each cell is how a builder tells two near-identical colours apart while sorting and
checking, so it is **never dropped and never shrunk past reading size**. That inverts the obvious
design: the smallest readable cell is the *input* to how many dominoes fit on a page.
`resolveCapacity` starts from `MIN_NUMBER_FONT_MM` and works outward. Manual and Fit to Pages let
the user's numbers win and **warn** rather than silently overriding — the same tell-them-why tone as
`imageMapEntryWarning`. `resolveCapacity` is split out from `paginateLayout` because the options
dialog shows the cell size and page count live as the user types, and has no use for the page list.

**Automatic and Fit to Pages are one branch of `resolveCapacity`, not two, and merging them is
what let a page count be left blank.** They were always the same calculation; the only thing that
differs is where the two page counts come from. Automatic works both out — the fewest pages an
axis needs at the smallest legible cell — and Fit to Pages uses whichever the user typed and works
out the rest. So **a blank box means "size this axis to fit"**, both blank behaves *exactly* like
Paginate Automatically, and `pagesWide`/`pagesLong` are `number | null` starting at null. Two
details hold it together:

- **The legibility floor applies only when nothing was typed.** A page count the user asked for
  wins outright and the warning says when it will print too small; with both blank there is nobody
  to overrule, so the cell never drops below `minScale`. That one `if` is the whole of the old
  difference between the two modes.
- **The panel says so rather than leaving it to be discovered** — a hint line under the two boxes,
  and `placeholder="auto"` in each. What a blank axis actually came out as is in the summary,
  which re-paginates live.

**Automatic is then two steps, and the second one is the fix for a real bug.** Settle the page
count at the smallest legible cell — which is the fewest pages possible — then **grow the cell as
far as that same page count allows**, capped at `MAX_CELL_WIDTH_MM`. Both halves are load-bearing
and each without the other was wrong:

- **Without the growth step the grid stopped short of the right margin.** The scale stayed pinned at
  the legibility floor however much room was going spare, so there was *always* leftover width: 20%
  on Letter portrait, and 22% on Legal landscape for a field narrower than the page. It read as
  orientation-specific because a portrait page is narrow enough that the field usually fills it, and
  Legal landscape is the widest paper in the list.
- **Without the page-count guard the growth silently costs paper.** A one-sheet layout would become
  two with much larger dominoes, which nobody asked for.
- **`perPageUp` vs `perPageDown` is the whole mechanism.** Rounding a page's capacity *down* to a
  whole division is right when asking how much fits; rounding *up* is right when the page count is
  already settled and the question is how few dominoes a page may hold without adding one. Rounding
  down in that second place lets an extra page appear.
- **`MAX_CELL_WIDTH_MM = 8` applies in every mode.** Without it a 10 × 5 field on Letter printed
  19.6mm dominoes — a handful of giant squares with nothing gained.
- **`fitsAt`'s `FIT_EPS` is load-bearing and reads exactly like a fudge factor.** The growth step
  picks a scale at which *exactly* `neededCols` fill the width; `fitsAt` then divides the width back
  by that cell size, and floating point returns `59.999999999999996` rather than `60`. Flooring that
  loses a whole division, `perPageDown` drops from three majors to two, and a two-page layout prints
  on three — silently, and only for the fields that happen to land on a boundary. An 86-column field
  was the report that found it. `fieldElement`'s `GEOMETRY_EPS` exists for the same reason in
  `fitCount`; the slack is orders of magnitude smaller than any real difference in fit.

**A shape mismatch is not a bug and cannot be scaled away.** A near-square field on wide paper still
leaves a gap, because closing it would need a second page and the cell aspect ratio is fixed by the
element's real geometry. Portrait, or Fit to Pages, is the answer there — not a change to this rule.

Four more decisions in `layout/`:

- **Cell size is global, not per page.** Sizing each page to its own content would draw larger
  dominoes on the last, narrower column of pages, and taped-together sheets would not tile.
- **`pageCuts`'s `Math.max(step, …)`** is what keeps a page making progress when a division is
  wider than a page will hold: it carries one oversized division rather than taking zero columns
  forever.
- **Columns break on `Major` by default and rows on `Major or minor`.** A page ending part-way
  through a template means carrying a half-loaded template across a page turn, which is the friction
  batching exists to remove; a row is not a template, so the looser rule there just wastes less
  paper.
- **`EDGE_BLEED_MM` is subtracted from the page in `resolveCapacity` and added back in
  `emitHtml`.** An SVG stroke straddles the line it sits on, so the page-edge rules would lose their
  outer half off the side of the drawing; the bleed is room for that half. Both halves are needed —
  widening the drawing without shrinking the grid would push it past the margin.

**A division landing on a page edge draws its own weight, on all four edges.** The four edges used
to be one `<rect>` at `BORDER_RULE_MM`, so a template ending exactly at the edge of a sheet looked
like an ordinary border and gave no sign that it did not continue overleaf. All four rather than
only the trailing pair, because the right edge of one sheet and the left edge of the next are the
*same* boundary and have to match when the sheets are laid side by side.

**Paper size is an option rather than `@page { size: auto }`**, because fitting cells to an exact
page is arithmetic and `auto` leaves nothing to do it with.

**`pagination` is a three-way mode, not a boolean.** It was `autoCapacity: boolean` until Fit to
Pages arrived. Each mode reads one pair of fields (`rowsPerPage`/`colsPerPage`, or
`pagesWide`/`pagesLong`) and Automatic reads neither, so the panel **hides** the pair not in use
rather than disabling it — and what Automatic worked out appears in the summary, which is then the
only place those figures exist. Note only the Fit to Pages pair may be blank: Manual's counts are
what that mode *is*, so there is nothing for a blank one to fall back to.

**Fit to Pages fills each page, it does not spread the element evenly over them.** The requested
page counts decide the *cell size* — the fewest dominoes a page must hold to reach that count,
rounded up to a whole division — and then the pages are filled as far as that size and the break
rule allow, leftovers landing on the last page. Only one axis can bind the cell size, so an even
spread strands whatever room the other axis had: 86 dominoes over two pages came out 43/43 with
space for 64 on each. Filling gives 60/26 under a major break rule, or 64/22 under `Any`, and is
what a builder working left to right expects. It cannot overrun the request, because the scale
already guarantees at least `neededCols` fit and `neededCols` is a whole number of divisions, so
flooring what fits can only land on or above it — and it may well come *under* the request, which
is correct.

#### The sort plan, and why its pages are measured

`encode.ts` is pure and paper-free; `emitHtml.ts` carries a short script that runs once the document
is parsed and moves **whole** row blocks into fixed-height pages. A row's runs wrap to a number of
lines nothing can predict in advance, so the pages are measured rather than computed — safe at parse
time only because the document uses **system fonts only** and so never reflows afterwards. A row too
tall for an empty page gets a page that grows (`pageOverflow`) and is broken by the browser, which
is worse than not splitting it and far better than clipping it away.

Four encoding decisions, all verified against the worked example in the original request:

- **Gaps are lowercase `skip(xN)`**, so scanning a column of counts never mistakes one for a colour
  named "Skip". A hidden domino and a position with no domino at all read the same, which is right:
  both are a tooth left empty.
- **Trailing gaps are trimmed, leading and interior ones kept.** The row simply stops; but someone
  loading a template has to know which teeth to leave empty.
- **A gap consumes a batch slot.** Boundaries count positions, not dominoes.
- **The batch counter resets at each row**, since a template is loaded one row at a time, and a run
  crossing a boundary is **cut with both halves keeping the colour name**.

#### The CSV export

`csv/encode.ts` is the whole document — the layout grid with its rows and columns numbered from 1
at the upper left, the legend under it, then the totals. **There is no emit step beside it**,
unlike the other two: a CSV has no pages, so there is nothing to paginate and nothing to lay out.
For the same reason there is nothing to set, which is why `CsvPlanOptions` is empty and the panel
spends itself saying what the file will hold instead. Five decisions:

- **A gap is an empty cell, and it cannot be a `0`.** Unassigned took 0 as its legend number, so 0
  is an ordinary colour a builder has to leave blank on the floor. Empty also reads as a hole in a
  spreadsheet, which is what it is. Deliberately not the sort plan's `skip`, whose job — not
  mistaking a gap for a colour named "Skip" in a column of *text* — does not arise here.
- **The BOM is load-bearing for Excel only.** Without it Excel reads a `.csv` in the machine's
  local code page and the `×` in "34 rows × 86 columns", along with any accented colour name,
  comes out as rubbish. Everything else skips it silently. CRLF for the same audience.
- **`csvCell` quotes only when it has to** — a comma, quote or newline in the value. Colour names
  and the element's name are typed by the user, so all three turn up.
- **The legend carries a hex column the printed one does not.** On paper the swatch says it
  better than six characters could; in a spreadsheet there is no swatch.
- **The closing lines are each a single value in the first column**, matching the printed legend
  page's totals word for word — including the gaps line, which appears only when there are gaps.

#### What is and isn't state

`buildPlanOptions` is **settings, not document state** — remembered globally rather than per
element, never undoable, exactly like image transparency and the Expand toggle. `BuildPlanDialog` is
a **true modal**, like `ConfirmDialog` and unlike `PropertiesDialog`: its scrim dims the canvas
(there is no live preview worth keeping bright), it swallows keydown in the capture phase so
`DesignerScreen`'s Ctrl chords and `DominoEditor`'s Delete cannot keep editing the element being
printed, and it is not draggable. It sits one z-index band below `ConfirmDialog` so the
pop-ups-are-blocked message it raises still lands on top of it.

**A CSV export is state in exactly the same sense the printed plans are: none.** It reads the
element and writes a file, so there is no undo entry and no operation kind — the same rule
recorded under *Current state and direction*.

**The menu items are gated on capability, never on type** — `getDominoRowCol(ddObject) !== undefined`
plus a non-zero domino count. The build plane declares neither and is excluded structurally rather
than by naming it, and a future element type is included the day it declares the same members. The
domino-count subscription reads a primitive, so it needs no `useShallow`. The menu is already
unreachable inside domino editing mode, since `Sidebar` swaps `DDObjectsPanel` out for
`DominoColorPanel`.

### The clipboard

`clipboard/` is a **generic subsystem, not a domino feature** — domino colors are merely its
first client, and DDObject cut/paste is expected to be its second with no change to anything
in that folder. Two seams do the work:

- **Which context handles a command is a registration, not a registry.** `clipboard/store.ts`
  holds one slot (`item: ClipboardItem | null`) plus a `cutCopyHandler`/`pasteHandler` pair
  that the currently-active context installs on mount and clears on unmount, via
  `useCutCopyHandler`/`usePasteHandler`. This is deliberately *not* the `DD_OBJECT_TYPES`
  pattern: which handler is correct depends on live app state (which mode is active, what's
  selected), not on a type name known at module load. The precedent it does follow is
  `CameraRig.tsx` publishing its imperative `CameraApi` into the store. The cleanup's
  **identity guard** (`if (getState().pasteHandler === handler)`) is load-bearing — React can
  mount a replacement registrant before unmounting the old one, and an unguarded clear would
  wipe the newer registration.
- **One keyboard dispatcher, in `DesignerScreen.tsx`,** alongside the Ctrl+Z/Y handler that was
  already there — and Ctrl+A since. Tools do not bind Ctrl chords themselves. This is why
  `DominoEditor.tsx`'s keydown handler still returns early on *every* Ctrl/Cmd chord and
  needed no change when either the clipboard or Ctrl+A landed; it is also what makes a future
  clipboard client zero keyboard code. Note this handler has no INPUT/TEXTAREA/contentEditable
  guard of its own (unlike `DominoEditor`'s), so it suppresses native Ctrl+C/X/V in any text
  field outside the properties dialog — latent today, since the only such fields are in the
  dialog, which it already excludes.

`copy()`/`cut()` write the slot **only when the handler returns an item**, so a copy with
nothing to take can't blank a good clipboard. A `PasteHandler` declares what it accepts via
`canPaste(item)`, so an item from another context is a silent no-op rather than an error, and
`useClipboardCapabilities()` gives UI the reactive `canCut`/`canCopy`/`canPaste` triple to bind
button enablement to. Those `can*` methods are imperative reads, so **enablement reactivity
comes from handler identity**: a registrant re-registers a fresh handler object whenever its
answers could have changed (its `useMemo` deps include the selection version). Don't add a
capability-version counter — that's what this replaces.

The domino-color clipboard **deliberately survives `exitDominoEditing`** (unlike
`dominoSelectedSwatchId`/`dominoColorShortcut`, cleared there), since the item snapshots its
source DDObject and stays valid across a resize or even a delete. That's what makes
field-to-field paste work.

### Pasting patterns between element types

Cut/copy is generic — indices and colorIds straight off the SoA columns, no per-type hook.
**Paste is where types differ**, and it's resolved in two steps that must not be conflated with
each other:

1. **`dominoRowCol(ddObject, flatIndex)` / `dominoIndexAt(ddObject, row, col)`**
   (`object-types/base.ts`) map a domino to its parent's own row/column-like ordering and back.
   Nearly every planned element type is row/col-like under some reading — a field literally is;
   concentric circles and spirals are polar (`col` = rings out from the centre, `row` = position
   around); a line is `row 0, col 0..n` — which is why this, and **not** millimetre positions,
   is the interchange format. A mm-space pattern would have to be quantised back onto the
   destination's lattice anyway, and would look wrong doing it.
2. **`dominoes/rowColPaste.ts` is one generic algorithm** over those hooks — corner correlation,
   tiling, truncation, holes — used for *every* type pair. It touches source and destination
   only through the two hooks, so a field pastes into a spiral and back with nothing in it
   knowing either exists. `resolveDominoColorPaste` runs it unless the destination type declares
   the optional `pasteDominoColors` override; nothing declares one today.

Consequences worth not reversing:

- **`dominoIndexAt` returning `undefined` is the per-type control over edge behavior.** A field
  rejects out-of-range so a stamped pattern clips at the boundary; a ring type would instead
  wrap `row` all the way around while still rejecting an out-of-range `col`. That is the
  delegation — don't add a separate "edge mode" parameter.
- **`dominoCellId` and `dominoRowCol` are different contracts and must not be merged**, even
  though `fieldElement` computes both from one shared `rowColOf` decode. `dominoCellId` is an
  opaque identity that must *survive a resize* (hence anchor-relative, hence the bias);
  `dominoRowCol` describes the layout as it is *right now*. Collapsing them breaks color memory
  in one direction or pattern geometry in the other.
- The row/col mapping must be **structurally meaningful**, not merely a bijection: dominoes
  adjacent in the physical layout differ by 1 in exactly one coordinate. A mapping that just
  enumerated dominoes would satisfy the inverse law and paste noise.
- For planar types `row` increases toward what the user sees as **up** — `fieldElement`'s row 0
  is its *bottom* row, per `layoutField` — so paste's correlation corner is `(max row, min col)`,
  the visual upper-left. Getting this backwards mirrors every paste vertically.

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
- It arms only when the **placement tool is active with a type armed** and **no properties
  dialog is open**. There is exactly one placement `ToolId`, `"newElement"`, and *which* type it
  places is `newElementType` beside it in the store — so `PLACEMENT_TOOLS`
  ([toolConfig.ts](frontend/src/designer/toolConfig.ts)) is the one place a placeable type is
  named, and registering another adds no `ToolId` member and no comparison anywhere. See *One
  tool for every element type* below for why it is split this way. The dialog guard is
  load-bearing: the
  dialog is modeless and the canvas stays interactive above its scrim, so without it a user
  could drag behind the open dialog and two Escape handlers would fight.
- Drag state is component-local; only the finished rectangle reaches `createElement`. Escape
  mid-drag clears the start ref, which is also what makes the pending pointer-up a no-op.
- **The rectangle-to-DDObject mapping is the type's own concern**, not the tool's: a type
  declares `createFromRegion?(region: Bounds): Partial<T> | undefined` on its
  `DDObjectTypeDefinition`, resolved via `getDDObjectCreateFromRegion`. `undefined` means the
  region was too small/invalid, and the tool discards it exactly like a cancelled drag. This
  mapping has to be per-type because each type's model shapes position/size differently —
  `buildPlane` has no position at all, `fieldElement` splits it into `position` plus
  `width`/`height`, and also seeds `anchorX`/`anchorY` from the region's corner with
  `originRow`/`originCol` at zero (*The field's anchor model*). There is deliberately **no
  richer create/update/finalize protocol**: the
  drag preview is already generic (a plain rectangle), and the DDObject isn't created until
  mouse-up, so nothing today needs a live type-specific preview mid-drag.
- `designer/ModeHintBar.tsx` prompts the user, reading the armed type's `placementHint` off its
  `PLACEMENT_TOOLS` entry. Adding a placement tool means filling that field in, not editing the
  hint bar's markup — it names no type.

The hint bar has three other states besides a placement prompt, and they are ordered
most-specific-first in one `if`/`else` chain: domino editing mode's own bar (Done / Cancel /
Help plus a sentence, see *Domino editing mode*), then the placement prompt, then Select's idle
hint. **The idle hint splits on `selectedDDObjectId`** — with something selected it names what
can be done to it (handles resize, drag moves, double-click edits colors, Delete deletes), with
nothing selected it says how to select, and with an empty build plane it points at New. That is
three sentences from one store read, and it is the only place the app tells a user that the
selection overlay's handles are draggable at all. Note the in-mode bar no longer reports what is
on the color clipboard; the clipboard is invisible in the UI now, by choice, rather than costing
a permanent sentence.

#### One tool for every element type

`ToolId` is `"select" | "newElement" | "editDominoes"`. It deliberately does **not** carry a
member per placeable type (it once carried `"field"`), for the same reason neither
`dominoShapeSelectId` nor `dominoBrushId` is a `ToolId`: `activeTool` answers *which mode am I in*,
and the variant chosen within that mode is a separate value. Note those last two are sub-modes of
the *same* mode and are mutually exclusive with each other, which is expressed by each slice's
setter clearing the other's field — a cross-slice write needing no import either way, since `set`
is typed against the whole `AppState`. The pieces:

- **`newElementType: DDObjectType | null`** in `store.ts` holds the armed type, and is null
  whenever `activeTool` isn't `"newElement"`. Every write that leaves the tool maintains that —
  `setTool`, `enterDominoEditing` (reachable while placement is armed, since the sidebar row's
  double-click works whatever tool is active), and the creating branches of `saveProperties` and
  `cancelProperties`.
- **`setTool` cannot arm it.** Its parameter is `Exclude<ToolId, "newElement">`, so
  `startNewElement(type)` is the only way in and "placing, but with nothing to place" is not
  representable. That type-level guard is why the invariant above is worth trusting; don't widen
  the signature back.
- **`PLACEMENT_TOOLS` carries no `id`** — the element type *is* each entry's identity, so there
  is no second name to keep in step. It supplies only what the registry can't: a short menu
  `label` (deliberately shorter than the type's `defaultName`) and the `placementHint`. The menu
  icon comes from `getDDObjectIcon`, so a type can't appear under one glyph in the New menu and
  another in the hierarchy panel.

What this bought, concretely: `DesignerScreen`'s placement crosshair was `activeTool === "field"`
and would silently not have appeared for a second placeable type; `ModeHintBar`'s hint was a
`Partial<Record<ToolId, string>>` with the same failure. Both are now type-driven and correct for
a type nobody has written yet.

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
  implementation splits on whether width/height actually changed: a **pure move** shifts
  `position` and `anchorX`/`anchorY` by the same delta and touches nothing else, while a
  **resize** takes `position`/`width`/`height` verbatim from the drag rect and re-derives
  `rows`/`dominoes_per_row`/`originRow`/`originCol` **absolutely from the anchor** — see *The
  field's anchor model* below, which explains why "absolutely" is load-bearing.

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
- **A hover cursor must be released when its mesh disappears, not only on `pointerout`.** This
  file is the only one in the app that writes a cursor imperatively (`gl.domElement.style.cursor`),
  set by the overlay fill (`move`), the eight handles (`*-resize`) and each `PickPlane`
  (`pointer`). R3F derives `pointerout` by diffing raycast hits between pointer events, so an
  object **removed from the scene while the pointer is over it never fires one** — and Delete is
  the worst case, arriving from a `keydown` with no pointer event at all. The cursor was then
  stranded on the canvas indefinitely, and because an inline style on the `<canvas>` outranks the
  inherited `cursor: crosshair` from `.canvasAreaPlacing`, the stale hand survived even the next
  placement drag. The fix is `cursorOwnerRef` — a token recording *which* mesh holds the cursor —
  plus one effect on `armed`/`selected`/`childIds` that releases it when that owner no longer
  exists. The token is load-bearing: without it the release would also clear a cursor a
  different, still-hovered mesh had since set. Don't replace it with an unmount cleanup on
  `PickPlane`; that fires for every plane that unmounts, hovered or not.

### Undo/redo

`history/appStoreSlice.ts` holds a single unified `undoStack`/`redoStack` over a discriminated
`Operation` union (`create` / `delete` / `transform` / `properties` / `dominoColors`) — one
stack for every DDObject-level (and now domino-color-level) change, not a separate stack per
subsystem. Two independent histories can't preserve true chronological ordering without
effectively rebuilding one timeline anyway, so this stays one stack.

`isDDObjectInUndoHistory(id)` scans both stacks for any operation still referencing a
DDObject id — used by `dominoes/store.ts` and `dominoes/colorMemory.ts` to defer freeing a
deleted DDObject's dominoes/color memory until its `delete` operation is no longer
reachable via undo or redo, so undoing a delete restores colors instead of resurrecting an
object with its domino data already garbage collected. See those files' "Domino data"
section entries for the full rationale.

**Undo is clamped while in domino editing mode.** `enterDominoEditing` stores the operation
then on top of `undoStack` as `dominoEditingUndoBarrier`; `undo()` refuses once that same
operation is back on top, so undo inside the mode can only reach back to the state the field was
in when the mode was entered — never past it into whatever created the field or edited it
beforehand. `exitDominoEditing` resets the barrier to `null`, so undo outside the mode is
unclamped again (and so is redo, always — only undo needs clamping, since redo only replays
operations already popped in this same session). `Toolbar.tsx`'s Undo button disables at the
clamp the same way it disables on an empty stack.

**The barrier is the operation itself, deliberately — not an index or a stack depth.**
`HISTORY_LIMIT` drops entries off the *front* of `undoStack`, which shifts every index but
leaves object identity untouched. A depth-based barrier therefore has to be sled down on every
push to compensate, and getting that wrong fails silently and only in long sessions: once the
stack sits at the cap its length stops growing, so a depth captured there stays at or above the
length forever and `undo()` refuses *every* edit made inside the mode (coloring, paste, cut) —
while those same edits all undo fine the moment the mode is exited and the clamp is released.
That was a real bug, and it is the reason this is a reference. Don't "simplify" it back to a
number. If in-mode work is heavy enough to push the barrier off the front, the clamp lapses,
which is correct: by then every surviving entry is in-mode work anyway.

This is deliberate scoping, not a side effect
of anything structural: nothing stops a `"dominoColors"` op from being undone outside the mode
(undoing a color change works whether or not domino editing mode is active — see *Domino data*'s
`dominoColors` case), so without this floor, undo from inside the mode would silently walk back
through unrelated DDObject-level history too.

**The barrier has a second reader: `cancelDominoEditing`.** Where Done (`exitDominoEditing`)
commits, Cancel discards, restoring the field to its state at entry. `ModeHintBar` prompts for
confirmation first (via `components/ConfirmDialog.tsx`), and only when
`hasOperationsSinceBarrier` says there is something to lose. **Its wording says the cancel
itself cannot be undone**, which is not a scare quote but literally the third bullet below: the
in-mode history is truncated rather than inverted, so once the user confirms, Ctrl+Z has nothing
left to walk back to. Three parts, each load-bearing:

- **The rollback is a snapshot restore, not a replay of the undo stack.** `restoreDominoColorSnapshot`
  writes back the `colorIds` column captured by `captureDominoColorSnapshot` at entry.
  **Do not "simplify" this into a loop calling `undo()` until it refuses at the barrier** — that
  was the first implementation and it is quietly wrong: `HISTORY_LIMIT` drops entries off the
  *front*, so past 100 in-mode edits the earliest ones no longer exist to be undone and Cancel
  returns a *partly painted* field with nothing signalling the shortfall. A snapshot is immune to
  the cap by construction. The snapshot deliberately covers only `colorIds`, the one thing the
  mode can change; a future in-mode feature that moves, adds or deletes dominoes must widen it.
- **The restore goes through `commitDominoColors`** like every other colour write, so it inherits
  the `colorByCell` sync (see *Domino data*) — skipping it would let a later regenerate repaint
  the very colors the cancel discarded. The operation it returns is dropped on the floor: a
  cancelled session records no history, exactly as `cancelProperties` records none.
- **The history is then truncated at the barrier** (`lastIndexOf`, which returns `-1` precisely
  when the barrier has aged off the front — in which case every surviving entry is in-mode work
  and the whole stack goes, the same reasoning that makes the clamp lapse safely). Truncating
  without reverting is sound **only because in-mode operations are colour changes and nothing
  else**, and that is what `enterDominoEditing`'s `redoStack: []` secures: undo is clamped at the
  barrier but redo deliberately isn't, so a leftover pre-mode `redoStack` would let Ctrl+Y replay
  pre-mode work into the mode, which Cancel would then drop from the stack without undoing it.
  Clearing it at entry costs nothing — the first in-mode `pushOperation` clears it anyway.

Every variant stores **whole-DDObject snapshots**, never per-field patches — a `fieldElement`'s
counts, `width`/`height`, `position`, `anchorX`/`anchorY` and `originRow`/`originCol` are all
derived from one another, by different write paths (`normalizeSize` for the editor,
`fitCountsThenSize` at creation, `setBounds` for a drag), which makes a field far too
interdependent to diff/reapply piecemeal. So undo/redo always restores (or removes/reinserts)
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

**A paint stroke is the one commit point that separates writing from recording** rather than
deferring both. Every other colour write records where it writes; a stroke writes on every frame
(the user has to see paint appear under the nib) and records once, at `endDominoStroke` on
pointerup. Escape mid-stroke is then the same self-healing story as Escape-mid-drag — nothing was
pushed, so `cancelDominoStroke` has only colours to put back and no operation to invert. See
*Paint brushes* for how the per-frame operations are folded into the one that lands.

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
help topic means adding a markdown file — no registration needed.

**Which topic opens is resolved two ways, and both matter.** A caller can name one outright
(`openHelpTopic(id)` → `helpTopicOverride`, which is what `ModeHintBar`'s in-mode Help button
uses); otherwise — notably the title bar's Help button, which names nothing —
`help/registry.ts`'s `topicForContext(screen, activeTool)` picks the contextual default. It
consults `TOOL_TOPIC` before `SCREEN_TOPIC` because what the user is *doing* is more specific
than where they are: keyed on screen alone, opening help inside domino editing mode landed on
`home`, since `SCREEN_TOPIC` is empty. `activeTool` is only consulted on the designer screen —
a `ToolId` means nothing elsewhere, and the store keeps the last one selected across a screen
switch, so without that guard leaving the designer mid-tool would carry its help page along.
On the designer screen with no tool-specific topic, it returns `designer` **directly rather than
through `SCREEN_TOPIC`** — so a `designer` entry added to that map would never be read. If a
second screen ever wants a default page, move this one into `SCREEN_TOPIC` rather than adding a
second hard-coded return.

The topics themselves are ordinary prose, but two conventions have settled in and are worth
keeping: a topic other than `home` opens with a breadcrumb line of links back up
(`[Home](home) > Build Designer`), and links between topics are written as bare topic ids —
though a `.md` suffix works too, since `HelpPanel` strips it before looking the topic up.
`HelpPanel.module.css` zeroes the margins on a `<p>` inside an `<li>`, because Markdown wraps
every item of a list in a paragraph as soon as any two of its items are separated by a blank
line, which would otherwise put a gap under every bullet in that list. That is a fix for how
people naturally write Markdown, not for one topic's formatting — don't ask help authors to
close up their lists instead.

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
- **Per-domino colouring exists now** (domino editing mode's swatch panel — see *Domino color
  editing*), assigned from the domino inventory rather than a free picker, referenced by id
  rather than copied as RGB (see *Domino data*'s `colorIds`/`colorLookupStore.ts` note).
  **Per-domino hiding rides the same `colorId`** as a flag rather than a column of its own; a
  per-domino *delete* is still unimplemented and must not be conflated with it (see *Domino
  data*).
- **A field's dominoes are still regenerated wholesale** whenever a layout parameter changes —
  `generateDominoes` always zero-fills a fresh `DominoData` — but this no longer loses colors:
  `restoreDominoColors` (*Domino data*) carries them forward, keyed by each domino's stable
  `dominoCellId`, across a resize, a screen-switch remount, or an undo/redo of either. A future
  per-domino delete will need the same treatment for whatever it stores, and gets it from the
  same registry-driven mechanism — a domino's cell id is exactly what such a feature would need
  too.
- **The field's anchor model.** A field is described twice over — physically, and by domino
  counts — and the two are reconciled by an *anchor*, not by a mode flag. There is no
  `fixed_size` any more, and no display-unit fields (`displayWidth`/`displayHeight`/
  `displayPosition`/`displayUnit`) either; both were removed because rounding sizes to
  friendly units corrupted the counts derived from them. Four decisions here are load-bearing
  and a fresh session would plausibly undo each one:

  - **`anchorX`/`anchorY` pin the grid; `position`/`width`/`height` only describe the box.**
    The anchor is the field's original creation corner and moves *only* under a whole-field
    translate — never under a resize. `originRow`/`originCol` count how many rows/columns
    currently sit *before* that anchor, and go negative once the bottom/left edges shrink past
    it. The grid origin is therefore `anchor - origin * pitch`, and it has exactly one
    definition — **`gridOriginWorld`**, with **`gridBaseLocal`** layering on the half-extents and
    the `position` subtraction to give the row-0/col-0 domino's centre in parent-relative mm.
    `normalizeField` re-hugs the box to the first, `modeller.tsx`'s `layoutField` places every
    domino from the second, and `snapShapePoint` quantises onto the second; hand-copying the
    expression a fourth time is how a resize starts moving dominoes. This is what lets a resize
    from *any* edge add or remove rows and columns while every existing domino stays exactly
    where it is — and, with `dominoCellId` keyed off the same anchor-relative coordinates, keeps
    their colors attached through it.
  - **`setBounds` must stay a pure function of `(bounds, anchor)`.** Deriving the counts
    incrementally — from the field's own live `rows`/`originCol` as the previous frame left
    them — is what made dominoes flash in and out during a drag: an asymmetric grow/shrink rule
    applied to state the last frame already changed never settles, it oscillates. Recomputing
    both counts absolutely from the anchor every frame is idempotent, and that is the whole
    fix. Do not "optimise" it back into a delta.
  - **The box is not the dominoes' bounding box.** After a handle-drag the boundary can sit up
    to one pitch away from the outermost dominoes — that gap is the room the next row or column
    will appear in, and it is deliberately visible. Do not re-snap the box to the grid mid-drag.
    `normalizeField` is the *one* place the two are re-hugged, on an editor edit, which is why
    it re-derives `position` rather than leaving it where it was.
  - **Growth and shrink are asymmetric, and the near and far edges use different spacing
    terms.** Growth only adds a domino once a full pitch of room exists; shrink drops one the
    instant the boundary cuts into its body. Measuring outwards from the anchor the last domino
    needs no trailing gap; measuring inwards from the near edge every domino needs a full pitch.
    Both are documented at `signedFitCount` and its four call sites. `signedFitCount` delegates
    its growth branch to `fitCount` rather than restating it, so a field *dragged* to a size and
    a field *created* at that size always agree; only its shrink branch is its own, and that one
    deliberately skips `GEOMETRY_EPS` where every other count applies it.
- **The field's geometry maths lives in its `object-model.ts`**, not a separate module, so the
  per-type folder keeps its object-model/editor/modeller shape. `modeller.tsx` therefore
  imports values from `object-model.ts` while that module imports the modeller as a value — a
  cycle that is benign *only* because nothing reads across it during module initialisation.
  **Never call `pitchX`/`pitchY`/`fitCount`/`signedFitCount`/`normalizeSize`/
  `fitCountsThenSize`/`normalizeField`/`createFromRegion`/`setBounds` at module scope.**
- **`extent()` in `dominoes/object-model.ts` has exactly one caller: the mode outline**
  (`DominoEditor`'s `modeOutlineRect`, see *Domino editing mode*). It is **not**
  interchangeable with a type's `bounds()`, and never will be. A field's `bounds()` reports its
  **boundary rectangle**, which needs no generated dominoes and is always defined; `extent`
  reports where the dominoes actually are. The two are *expected* to differ after a resize, by
  the gap described in *The field's anchor model* — so swapping `extent()` in for `bounds()`
  would silently shrink a field's selection overlay onto its dominoes and break `SelectionTool`'s
  drag maths. The mode outline can use it precisely because it is decorative: nothing measures a
  drag against it. `extent` remains the generic footprint primitive other element types will
  want, and note it reports the bounding box of domino **centres** — half-extent and expansion
  padding are the caller's job.
- **`color` is a `"#rrggbb"` hex string** specifically because that is the shape color-picker
  controls consume directly — including the native `<input type="color">` that `ColorField`
  wraps, which is why no color-picker dependency was added.
- **Selection exists now** (`selectedDDObjectId`, see *Selection and direct manipulation*), but
  `CameraApi.frameDDObject` is still not called on select — framing a *selected* object is left
  for later. Its only caller is `enterDominoEditing`; a plain single click still doesn't move the
  camera, deliberately, since selection happens constantly and a moving viewport would fight the
  user. The row ⋯ menu continues to act on its own DDObject independently of what is selected.
- **Freehand painting exists now** (`paint-brush/`, see *Paint brushes*) alongside the
  select-then-apply route. It is the only route that writes continuously while
  recording a single undo entry, and the only sub-mode whose *size* is a per-variant number rather
  than a shared one — "Medium" is a different reach for the pencil than for the quill, which testing
  established and a shared table would quietly undo.
- **Image mapping exists now** (`image-map/` with its `patch-sample/`, plus `color-distance/` and
  `dither/`, see *Image mapping*)
  — the third route to a domino's colour, and the only one that chooses colours rather than being
  told them. **Which colours it may choose from is the user's now**, via the sidebar's Use Colors
  setting and the swatches under it (see *Which colours a run may use*) — the swatches are no longer
  simply inert during mapping. One thing about it is still the current version's line rather than
  the design's: a run **assumes unlimited dominoes of every colour**, ignoring the inventory's
  `available` counts. That is a scoped decision, not an oversight to be quietly corrected.
- **A picture is now an overlay first and a colour source second**, and the two were deliberately
  split apart (see *Image mapping*). Showing one is an ordinary part of domino editing — tracing a
  sponsor's logo with the shape gestures and brushes is the use that motivated it — while mapping
  its colours stays a mode. Do not re-tie drawing to `imageMapActive`, and do not re-add
  click-the-picture-to-select: both would put back the second canvas-wide plane whose removal is
  what makes the split possible at all.
- **A picture's geometry and its comings and goings are undoable now**, over a single `"imageMap"`
  operation; show/hide, transparency and layer deliberately are not, being view aids rather than
  document state. The earlier note that placement records nothing is superseded, and the anticipated
  mode-scoped undo stack turned out not to be needed — the one shared stack took it.
- **Error diffusion exists now** (`floydSteinberg` and `atkinson`, see *The dither registry*), and
  widening `DitherDefinition` to hold it is what turned a definition into a per-run object. The two
  are registered together deliberately: they differ only in their table of weights, and having both
  is what makes the trade between them — faithful on average versus keeping the extremes — a thing
  that can be looked at rather than argued about, the same reasoning behind the two Dominant
  samplers and the two perceptual metrics.
- **A tonal-range pre-pass is the one thing still deliberately absent from the colour choice, and
  it is wanted.** Stretching a picture's own range of light and dark onto the range the inventory
  actually spans is the single biggest remaining improvement for photographs and paintings, and it
  is **not** a metric: if the darkest active inventory colour is a mid-charcoal, every metric is
  *correctly* reporting that nothing darker exists, and no change of formula can recover the
  contrast. Don't try to solve it inside `color-distance/`. Note error diffusion narrows the gap
  without closing it — it can suggest a tone between two the inventory holds, but not one outside
  the range of every colour in it.
- **Build plans exist now** (`build-plan/`, see *Build plans*) — the first thing in the app
  that leaves it, and the point the rest of the design has been building towards. Three decisions
  there are scoped rather than oversights: a run **assumes unlimited dominoes of every colour**, as
  image mapping does, so the legend's counts are a requirement rather than a check against the
  inventory's `available`; there is **no PDF backend**, deliberately, the browser's print dialog
  being where the PDF comes from (the seam for one is recorded in *Build plans* and is a file per
  document, not a redesign); and **page cutting assumes columns map to a rectangle**, which is true
  for a field and would need thought for a spiral. Everything else about a non-grid type is already
  handled, since the geometry is read from the dominoes' own positions.
- **A build plan is no longer necessarily printed.** Export CSV writes a file instead, which is
  what `actionLabel`/`deliver` on `BuildPlanDefinition` are for — the seam is about *delivery*, and
  is deliberately not the same seam a PDF backend would use (that one is `emitHtml`'s neighbour
  inside a document's own folder, and would still be delivered by `openPlanTab`). A data export
  wanting a different shape — JSON, or a per-template pick list — is now a folder and a registry
  line, with nothing in `BuildPlanDialog` to change.
- **A build plan is not a document-state change and records no history.** It reads the element and
  writes nothing back into it, so there is no undo entry, and its options are settings in the same
  class as image transparency. Don't add an operation kind for it — saving a file is not an edit.
- **Locked-colour mode existed and was deliberately removed.** A swatch could be locked
  (double-click, or its menu's `Lock`), after which *every* selection change repainted whatever it
  had just selected. It was a pre-brush stand-in for a brush, and once real brushes existed it was
  only a hazard: it made every selection destructive, worst of all Ctrl+A, which repainted a whole
  field in one keystroke and was reachable by accident with a brush in hand. Everything it was good
  for is covered by Ctrl+drag to extend a selection and then clicking a swatch.
  `dominoSelectedSwatchId` is what replaced it and is **not** the same thing: it stores the choice
  and nothing else, and only a paint brush acts on it, only while its button is down. Do not
  propose a lock as an enhancement, and do not "restore" the pieces that went with it — the
  `RiLockFill` badge, the swatch double-click, the menu's `Lock` item, the derived
  `matchedSwatchId` highlight, or a clear of the selected swatch inside `setDominoBrush`.
- **There is one generic modal, `components/ConfirmDialog.tsx`**, raised by ModeHintBar's Cancel,
  the image menu's replace warning, and image mapping's two explanations. It is owned by whoever
  raises it (local state, mounted inline) rather than by the store — unlike `PropertiesDialog`
  there is no shared editing session behind it, just a question and two callbacks. It is a *true*
  modal, in contrast to the properties dialog: its scrim dims the canvas too, and it swallows
  every keydown in the capture phase so the window-level handlers behind it (`DominoEditor`'s
  Delete and colour shortcuts, `DesignerScreen`'s Ctrl chords) can't keep editing the thing being
  asked about. **Omitting `confirmLabel`/`onConfirm` makes it acknowledge-only** — one button,
  doing what Escape and the scrim already did. That is what keeps it the single modal rather than
  there being a near-identical second component for telling the user something.

## Code style0

- Co-located CSS Modules: `Component.tsx` + `Component.module.css`, imported as `styles`.
- Shared design tokens are CSS custom properties (`--color-chrome`, `--color-text-dim`,
  `--color-accent`, `--sidebar-width`, ...) defined in `src/global.css`. Use them rather than
  hard-coded colors so new UI matches the existing chrome.
- Icons are React components passed around typed as `RemixiconComponentType` — not string names.
  Most come from `@remixicon/react` (`RiSquareLine`, `RiGridFill`); the rest are hand-drawn, and
  the two are interchangeable everywhere by design (see *Hand-drawn icons* below).
- Comments in this codebase explain *why* and flag interim decisions (e.g. "Stub for v1").
  Match that density rather than narrating what the code plainly does.

### Hand-drawn icons

Remixicon has no glyph for most of the shape-select gestures, and a drawing of the gesture itself
turned out to say more than any stock icon anyway. `src/icons/` holds the ones drawn by hand
(PowerPoint → *Save as Picture* → SVG, sources kept in `src/assets/`).

- **`createSvgIcon(Svg, viewBox)`** adapts what `vite-plugin-svgr` produces — a component taking
  raw SVG attributes — into the `size`/`color` contract the app passes icons around by. It puts
  `fill={color}` on the `<svg>` and nothing on the paths, which is the whole mechanism: `fill` is
  inherited, so an icon follows a button's four colour states exactly as a Remixicon one does. An
  exported path carrying its own `fill` would freeze one colour and stop matching its neighbours.
- **`viewBox` is required, and `paddedViewBox(width, height)` is how to supply it.** PowerPoint
  writes `width`/`height` and no viewBox, which pins a drawing to one size; nothing upstream fills
  that in, because the svgr plugin runs no SVGO (see `vite.config.ts`). The padding matters too — a
  drawing filling its own box reads visibly heavier than a Remixicon glyph, which leaves a margin.
- **`src/icons/index.tsx` is the one barrel file in `src`.** It earns the exception because icons
  import nothing from the app, so it cannot join an import cycle. Not a licence for barrels
  elsewhere.
- **The two numbers passed to `paddedViewBox` must match the `width`/`height` on the first line of
  the `.svg`, and nothing checks it.** TypeScript cannot see inside the file and the build passes
  either way; the only symptom is an icon sitting slightly off-centre or at the wrong size. This
  has already drifted once. Re-check line 1 after every re-export.
- **A *family* of icons whose relative sizes matter breaks that rule on purpose, and shares one
  viewBox.** The six paint-brush size glyphs (`PAINT_BRUSH_VIEW_BOX`) are all
  `paddedViewBox(828, 826)` — the largest of them — rather than each file's own numbers, and the
  comment there says so because the next reader will otherwise "fix" it back. Two things make it
  necessary. Per-file boxes *normalise* the drawings, so the nib would grow far less than it should
  while the shared droplet in every one of them visibly **shrank** as the size went up, partly
  inverting the cue. And a shared box that *centred* each drawing would fix the scale but move the
  droplet, because these drawings are anchored at their origin rather than their centre — only one
  identical viewBox string holds it still. The rule generalises: **the exception applies whenever
  several drawings must be compared to each other, and then all of them must share the box.**
  Note the glyphs are indicative, not to scale — drawn at the true millimetre ratios a Small nib
  would be nearly invisible at 20px, so don't "correct" them to match.
- **Id collisions are handled, by SVGO's `prefixIds` — don't remove it.** PowerPoint emits ids for
  gradients, picture fills, shadows and clipping, numbered from zero *within each file*, so almost
  every export that has one calls it `clip0`; an inlined icon's ids then belong to the whole page
  rather than to its own file. Two drawings both carrying `clip0` put two `<clipPath id="clip0">`
  into one document, every `url(#clip0)` resolves to whichever came first in DOM order, and one
  icon is clipped by the other's rectangle. `vite.config.ts` therefore runs `@svgr/plugin-svgo`
  ahead of `@svgr/plugin-jsx` with `["preset-default", "prefixIds"]`, which renames each id to
  `<Filename>_svg__a`. This stopped being hypothetical the moment the six `Paint-Circle-*` /
  `Paint-Quill-*` exports landed — every one of them carries a clip path. Two traps recorded in
  full at that config: `preset-default` alone does **not** fix it (its `cleanupIds` only shortens
  ids within one file, so two files both end up with an id named `a`), and there is deliberately
  **no top-level `svgo` dependency**, because `@svgr/plugin-svgo` pins svgo 3.x itself and adding
  svgo would only install an unused 4.x alongside it.

The three rules below apply to **code and comments you write or change from now on**. They are
not a licence to go reformat what is already here — existing names and comments are only worth
touching when you are editing that code anyway.

- **Write comments in plain language, and say things directly.** Prefer "if there is no snap
  function, the point is returned unchanged, so shapes can just call it without checking" to
  "resolves the undefined case to an identity, so a variant calls the result unconditionally".
  Two habits to avoid. First, maths and computer-science jargon — *identity*, *idempotent*,
  *contravariant*, *erasure*, *monomorphic* — where an ordinary sentence carries the same
  meaning; where such a word genuinely is the clearest one, explain it in the same sentence the
  first time it appears in a file. Second, indirection that makes the reader hold something in
  their head: "calls the result" forces them to work out that the result is a function before
  the sentence means anything, where "calls the snap function" just says it.
- **Assume the reader is new to React, react-three-fiber and three.js, and has never written
  GPU code.** This is the actual audience for this codebase's comments and for this file. Say
  what a piece of machinery *is* before saying why it is used: a `<group>` is a three.js node
  that applies its position to everything nested inside it; an *instanced attribute* is one
  value per copy of a repeated mesh, uploaded as an array the GPU indexes by copy number; a
  *uniform* is a single value shared by every pixel a shader draws in one pass, as opposed to
  one that varies per pixel. A term like `onBeforeCompile`, `depthTest`, `polygonOffset` or
  `raycast` deserves a clause saying what it does, not just that it is needed. Where a comment
  would balloon, one sentence naming the concept plus a pointer to the section of this file that
  explains it is enough.
- **Name things in full.** `selectionGestureEvent` over `event`, `snapShapePoint` over `snap`,
  `dominoIndexUnderCursor` over `idx`. A longer name that removes a guess is worth the
  characters. Short names are fine only where the line itself already says what the thing is —
  the `e` of a one-line JSX event handler, the `i` of a `for` loop over dominoes, the `p` of a
  two-line point helper. Anything that lives longer than a few lines, crosses a function
  boundary, or appears in an exported signature gets the full name.
- **DDObject naming.** Any identifier — variable, parameter, prop, type, or function — that
  holds or means a DDObject (as opposed to an incidental JS object, e.g. three.js `Object3D`
  or a plain object literal) is named with the `ddObject`/`DDObject` convention: `ddObject` /
  `ddObjects` for values, `DDObjectXxx` for types (`DDObjectId`, `DDObjectTypeDefinition`),
  and `xxxDDObjectXxx` for functions or props that operate on one (`updateDDObject`,
  `getDDObjectIcon`, `ddObjectId`). A bare `object` in this codebase should always mean
  something that is *not* a DDObject; if it does mean one, rename it.
  **The convention is about what a name *means*, not where it happens to be used.** A general
  type that a DDObject accessor merely returns does not take the prefix — `Bounds`
  ([types.ts](frontend/src/types.ts)) was once `DDObjectBounds` in `object-types/base.ts`, and
  the name went wrong the moment the same four numbers started describing a rubber-band drag,
  a region drawn to create an element with, and an image placed over a field, none of which is
  a DDObject. The accessor keeps the prefix (`getDDObjectBounds`) because *it* is about a
  DDObject; the rectangle it hands back does not. The per-type union member
  aliases carry the suffix too (`BuildPlaneDDObject`, `FieldElementDDObject`). Identifiers
  already unambiguous through an `Id`-typed-as-`DDObjectId` suffix (`rootId`, `parentId`) are
  exempt — don't force those to stutter.
- **Avoid use of the word 'seed' and its variants.** To the owner of the project, "seed" should be reserved for generative algorithms which grow into large complexity from a small seed. Instead of "seed" or "reseed" consider alternative, simpler and more direct words such as "change", "initialize", "set", or "reset".
