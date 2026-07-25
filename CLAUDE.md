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
a new object literal; `CameraRig.tsx` and `RegionTool.tsx` both subscribe to it and both need
the wrapper. `s.ddObjects[id]` and similar direct reads are exempt — they return the store's own
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
`frameloop="demand"` (so changes made outside the render loop need `invalidate()` to repaint).

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
is uncalled until a selection model exists to call it.

Note that drei's `<OrbitControls>` calls `invalidate()` on its own `change` event, so ordinary
user pan/zoom repaints without CameraRig doing anything. Only imperative changes you make
yourself need an explicit `invalidate()`.

### Domino data

`frontend/src/dominoes/` holds the dominoes themselves, separately from the DDObject
hierarchy. It is **generic on purpose** — fields today, walls/towers/lines later — so it knows
nothing about grids, rows or spacing. The parent element decides where its dominoes go; the
subsystem stores them (`object-model.ts`/`store.ts`) and draws them (`modeller.tsx`).

`object-model.ts` defines `DominoData`, a **Structure of Arrays**: one flat typed array per
attribute (`positions` stride 3, `orientations`, `colors` stride 3, `hidden`), plus
`count`/`capacity`. That shape exists because it is what an `InstancedMesh` consumes and because
tens of thousands of dominoes must cost no per-object allocation. `generateDominoes(count)`
allocates and defaults them; `extent(data)` derives a footprint from the dominoes themselves,
which is how an element's `bounds()` stays honest without duplicating layout maths.

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
  the main store mid-construction through the module cycle.

The subsystem is split into a **parent half** (per element type, decides layout) and a **shared
drawing half** (`dominoes/modeller.tsx`, one implementation for every type).
`object-types/fieldElement/modeller.tsx` is the worked example of the parent half: it owns the
grid maths, and when a layout parameter changes it regenerates the dominoes and `put()`s them
into the store — then renders `<DominoModeller>` and draws nothing itself. Any future
domino-producing type does the same: write the store, render `DominoModeller`.

`dominoes/modeller.tsx`'s `DominoModeller` draws a parent's dominoes as two objects sharing one
set of per-domino transforms: a **filled `InstancedMesh`** (one geometry/material/draw call,
per-domino `instanceColor`) and a black **edge outline**. Note `InstancedMesh` does *not* read
`DominoData` — it owns `instanceMatrix`/`instanceColor`, so `DominoModeller` copies the columns
across (expanding x/y/z into a 4×4 matrix) and sets `needsUpdate`; its instance count is fixed
at construction, hence the `key={capacity}` remount when a field is resized. The outline can't
be an `InstancedMesh` (that renders triangles, not lines), so it is an **instanced
`LineSegments`**: one base `EdgesGeometry` of a domino box, drawn once per domino via
per-instance `aOffset`/`aScale` attributes placed by an `onBeforeCompile`-patched
`LineBasicMaterial`. Same one-draw-call, no-per-object-allocation budget as the fill; the
outline's attributes come only from positions/visibility, so a color change never touches them.

Not built yet, and designed to land on this substrate: an operation/command model with
undo/redo stacks, and raycast picking (`intersection.instanceId` → domino index) to enable
per-domino editing.

### Element placement and creation

Placement tools draw their element onto the build plane rather than dropping a default one.
`designer/RegionTool.tsx` is **fully generic** — it imports no concrete DDObject type, only the
registry — which makes it the pattern to copy alongside `Scene.tsx` and `CameraRig.tsx`:

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
- **Dominoes are all one colour for now.** `DominoData.colors` is already a per-domino
  column, but nothing sets it — `generateDominoes` fills every domino with
  `DEFAULT_DOMINO_COLOR` and there is no colour control on the field editor. Per-domino
  colouring was deliberately deferred as too complex for this version; the data is shaped
  for it, so landing it needs no migration. (Don't restate the hex here — read it from
  `dominoes/object-model.ts`.)
- **A field's dominoes are regenerated wholesale** whenever a layout parameter changes.
  That is only safe because per-domino edits don't exist yet. Once they do, regenerate has
  to become an operation and decide what it preserves.
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
- **There is still no selection model.** The row menu acts on the DDObject whose ⋯ was clicked;
  nothing is "selected", and `CameraApi.frameDDObject` remains a stub for when that changes.

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
