# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**To prevent bloat, this file should be used for wide-scale information.**

Local information which is only appropriate to a single file should be put in comments in the source code itself. Information about a single subsystem should be put in the CLAUDE.md file within the sub-system's folder's nested CLAUDE.md (see below).

Over time, this CLAUDE.md file should be scrubbed of all localized information.

**To prevent bloat, do not include historical decisions.**

Specificaly, do not include any old, abandonded decisions from planning phases. Only document the "as is" system.

## Commands

All frontend work happens in `frontend/` (there is no root-level `package.json`):

```
cd frontend
npm install
npm run dev      # Vite dev server with hot reload, http://localhost:5173
npm run build    # tsc --noEmit && vite build  -> frontend/dist
npm run preview  # serve the built dist locally
```

`npm run build` type-checks before bundling, so it is the single command that catches everything.
For a faster check without bundling, `npx tsc --noEmit`.

**There is no test framework and no linter configured** — no vitest/jest, no eslint. Do not invent
commands for them. Verification is `npm run build` plus exercising the app in the dev server.

Serving the production build through the FastAPI server (it only serves `frontend/dist` and has no
API endpoints, so a frontend rebuild is required after frontend changes):

```
cd frontend && npm run build
cd ../server && pip install -r requirements.txt
start_server.bat     # or: python -m uvicorn main:app --reload   -> http://127.0.0.1:8000
```

## Where things are documented

This file covers what is shared across the app. Each feature folder carries its own CLAUDE.md,
loaded when you work in it:

| Folder | Covers |
|---|---|
| `designer/` | domino editing mode and the swatch panel — the mode entered by double-clicking an element |
| `dominoes/` | the per-domino data store, its columns, colour ids and colour memory |
| `image-map/` | laying a picture over an element and mapping its colours |
| `color-distance/`, `dither/` | the two registries a mapping run composes |
| `build-plan/` | the printed layout, sort plan and CSV export |
| `shape-select/`, `paint-brush/` | the two families of domino editing gestures |
| `components/` | the properties dialog and the shared property fields |
| `help/`, `icons/` | the help topic system and the hand-drawn icon set |
| `structure-designer/` | the second design surface, deliberately independent of the rest |

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

Extensibility is a **first-class architectural goal**, not an eventual refactor. Many new element
types are expected over time, potentially from third-party developers, so any file that must be
edited once per new type is treated as a **source-code configuration bottleneck to be designed
away**.

The pattern — established for DDObject types and intended as the template for future extensible
subsystems (tools, property editors, exporters):

- Each variant lives in **its own module** and is **self-describing**: it exports its data shape
  plus a definition object supplying its metadata and a factory for a default instance.
- A **single registry** file lists the variants. Registration is the only central edit.
- Everything else consumes variants through **registry accessors**, never per-type branching. A
  `switch` on a type discriminant outside a registry is a design smell here.

Prefer extending a registry over adding a central config map or conditional. When adding a new kind
of extensible thing, follow the `object-types/` layout rather than inventing a parallel convention.

### State: one zustand store (plus deliberate exceptions)

`frontend/src/store.ts` holds all app state — screen, menu/help flags, active tool, the DDObject
hierarchy, the properties-dialog state, the camera bridge, and (via slices) each feature's own.
Components subscribe with selectors (`useStore((s) => s.foo)`); non-React code reads imperatively
via `useStore.getState()`.

Nothing is persisted; the store is a plain `create()` with no middleware. Every load starts a fresh
default project. `updateDDObject` is the single write path for DDObject properties — property
editors go through it rather than reaching into `ddObjects` themselves.

**`dominoes/store.ts` is the exception that defines the rule.** This store is immutable
copy-on-write; that one is bulk typed arrays mutated *in place*. Mixing the two disciplines would
mean cloning a 100k-element buffer on every domino edit, and snapshotting it for the properties
dialog's rollback. The boundary: **this** store holds identity, layout parameters and UI state;
**that** one holds per-domino columns. The dependency runs one way — `dominoes` imports `store.ts`,
never the reverse.

That bar — *a different mutation discipline* — is the test for earning a store of your own within
the domino designer. Ordinary copy-on-write state that merely belongs to one feature does **not**
qualify; it becomes a **slice** instead. (`structure-designer/store.ts` is earned a different way:
it is a separate design surface editing a separate document. See its own CLAUDE.md — and don't
generalise that into "a big feature may have a store".)

#### Slices

`store.ts` grew past a thousand lines holding every feature's state inline, so a feature's members
live in an `appStoreSlice.ts` under that feature's own folder while remaining part of the one
`AppState`. Seven exist today:

| Slice | Holds |
|---|---|
| `domino-inventory/appStoreSlice.ts` | the inventory catalog, its selection and its sort |
| `history/appStoreSlice.ts` | `Operation`, the undo/redo stacks, the domino-editing undo barrier |
| `dominoes/appStoreSlice.ts` | the selected swatch and the shortcut buffer, every domino-colour write (including a paint stroke's), select-by-swatch, the Expand toggle, and domino editing mode's cancel snapshot |
| `shape-select/appStoreSlice.ts` | which shape-select gesture is armed, and its hint text |
| `paint-brush/appStoreSlice.ts` | which paint brush is armed, and each brush's chosen size |
| `image-map/appStoreSlice.ts` | the picture laid over each element, the two image sub-modes' view state, the chosen sampler, metric and dither, which colours a run may pick from and which dominoes it may colour, and the run itself |
| `build-plan/appStoreSlice.ts` | which plan's options dialog is open and for which element, and each plan's remembered settings |

What's left in `store.ts` is the state that isn't any one feature's: screen/menu/help, the DDObject
hierarchy and its actions, domino editing mode, the properties dialog, and the camera bridge.

- A slice module exports its own interface plus a `StateCreator<AppState, [], [], ItsSlice>`. The
  **first** type argument is the whole `AppState`, not the slice — that is what lets a slice's
  `set`/`get` read every other slice's members with no plumbing, and what keeps this from
  fragmenting into separate stores. The **last** narrows what the creator must return, so a member
  dropped during a move is a compile error. The two `[]`s are middleware slots, empty because there
  is no middleware.
- `store.ts` declares `AppState extends ItsSlice` and spreads `createItsSlice(set, get, api)` into
  the initializer. The type recursion is fine — it passes through a generic parameter rather than an
  alias expansion.
- **Naming: `appStoreSlice.ts`, in the feature's folder.** Deliberately not `slice.ts`, because
  `dominoes/` and `clipboard/` already have a `store.ts` of their own — this says unambiguously
  "this feature's slice of the *app* store," as distinct from a store the feature owns outright.
- A slice imports `AppState` **type-only**. `domino-inventory`'s and `shape-select`'s need nothing
  else from `store.ts` and are fully acyclic; the rest reach `dominoes/store.ts` and
  `dominoes/colorMemory.ts`, which import `useStore` back, so they sit in a cycle.

**`store.ts` must remain the only importer of a slice's creator.** That cycle (`store.ts` → slice →
`dominoes/*` → `store.ts`) is safe *only* while `store.ts` is the module that enters it. Entered at
a slice instead, `store.ts`'s body runs while the slice module is still mid-evaluation and calls
`createXxxSlice` before the `const` is initialized. It fails loudly at startup rather than silently,
but it fails. Import a slice's *types* from anywhere; import its creator only from `store.ts`.

Two things exist specifically to keep that cycle small:

- **`ddObjectOps.ts`** holds the pure hierarchy operations (`applyRemoveDDObject`,
  `applyInsertDDObjects`, `collectSubtree`, `ddObjectsEqual`) that both `store.ts`'s recording
  actions and history's `undo`/`redo` need. A neutral module is what lets history avoid a value
  import from `store.ts`, and it makes the raw/public split structural: a module that cannot reach
  an action cannot accidentally record one (see *Undo/redo*'s re-entrancy note).
- **`isDDObjectInUndoHistory` stays in `store.ts`**, though conceptually history's, because it
  queries the *live store*. History exports the pure per-operation predicate
  (`operationReferencesId`) it runs. Moving the query into the slice would add the one value import
  the split avoids.

Consumers are unaffected either way — `useStore((s) => s.inventoryEntries)` and `useStore.subscribe`
work identically whether a member is declared inline or in a slice. Moving members into a slice is
therefore a pure refactor with no call-site churn, which is the point, and why none of the moves
touched a component.

**Any `useStore` selector that computes a fresh object or array (rather than reading a stored
reference or a primitive) must be wrapped in `useShallow`** (from `zustand/shallow`), or
`useSyncExternalStore` treats every render as a store change and loops — React error #185,
"Maximum update depth exceeded", and in a canvas component it takes the WebGL context down with it.
`getDDObjectBounds` is the one function with that shape today, since every `bounds()` returns a new
object literal; `CameraRig.tsx`, `CreateByRegionTool.tsx` and `SelectionTool.tsx` all subscribe to
it and each needs the wrapper. `s.ddObjects[id]` and similar direct reads are exempt — they return
the store's own stable reference, not a computed one.

Screens are a registry, not a router: `ScreenId` -> component in `App.tsx`, plus a `MENU_ITEMS`
entry in `components/HamburgerMenu.tsx`. **A screen component lives in its own feature's folder** —
`designer/DesignerScreen.tsx`, `domino-inventory/DominoInventoryScreen.tsx`. There was a `screens/`
folder holding them all; it was retired because a screen is the root of its feature rather than a
thing of its own. Two details of the registry:

- **`SCREENS` is a `Partial` record**, and `App` falls back to the designer for a screen with no
  entry. That is what lets a screen be removed from a build outright rather than merely having its
  menu item hidden — a menu is not a security boundary.
- **`MENU_ITEMS` entries carry an optional `enabled`**, filtered on render. Omit it for a screen
  that is always available; set it false to keep one out of the menu. A general mechanism rather
  than a named special case, so the next screen under construction reuses it.

### The DDObject hierarchy and its extensibility contract

This is the part most likely to be implemented wrongly by reflex. The build's contents are a **flat
registry of DDObjects indexed by id** — `ddObjects: Record<DDObjectId, DDObject>` plus `rootId` —
**not a nested tree**. Parent/child is expressed by a `children` array of ids. Ids are `"DDO-#"`,
minted from `nextDDObjectNumber`. Level 0 is the `BuildPlane` root; level 1 is `FieldElement`.

Types live one per folder under `object-types/<name>/`, each **self-describing**. Three files for a
drawn type, plus one registry line:

- **`object-model.ts`** — the data `interface` *and* the `DDObjectTypeDefinition` (`base.ts`):
  `icon`/`defaultName`, the `create()` factory, and the wiring of `editor`/`modeller`/`bounds`/
  `createFromRegion`. Any pure geometry the type needs lives here too.
- **`editor.tsx`** — the property editor, assembled from the shared inputs in
  `components/PropertyFields.tsx` and hosted by `PropertiesDialog.tsx`. Resolved through the
  registry; **imported by nothing but its own definition module**.
- **`modeller.tsx`** *(drawn types only)* — a component of the DDObject returning three.js scene
  nodes. A **domino-producing** modeller does **not** draw dominoes itself: it decides where they
  go (writing positions into the `dominoes` store) and renders the shared `DominoModeller`, which
  owns the meshes. Declare `bounds(ddObject)` too if the camera should be able to fit or frame it.
  Same import discipline as the editor. `fieldElement/modeller.tsx` is the worked example.

Then **register it in `object-types/registry.ts`** — the map entry in `DD_OBJECT_TYPES` **and** a
member in the `DDObject` union. Those two lines are the only central edits. (The union member is
unavoidable: TypeScript cannot derive a discriminated union from a runtime map while preserving
each type's concrete shape.)

**Consume types through the registry accessors** — `getDDObjectIcon`, `getDDObjectDefaultName`,
`createDDObject`, `getDDObjectEditor`, `getDDObjectModeller`, `getDDObjectBounds`,
`getDominoExpansion`, `getDominoLayoutAnchor`. Do not add `switch (ddObject.type)` branching or a
central per-type metadata config anywhere else in the app.

`editor`, `modeller` and `bounds` all take the DDObject type as a *parameter*, which is what stops
a concrete definition being assignable to one over the base type. `DD_OBJECT_TYPES` is therefore
declared against `AnyDDObjectTypeDefinition` (`DDObjectTypeDefinition<any>`) and the accessors cast
back. That loss of type information belongs to the registry seam and nowhere else.

`DDObjectsPanel.tsx` renders the hierarchy by recursing from `rootId`, driven entirely by store
selectors so it updates as DDObjects are created. Each row carries a hover-revealed **⋯** button
opening `DDObjectMenu` (Delete / Properties / Edit Colors, plus one item per registered build
plan); Delete is disabled for the root, and `removeDDObject` refuses it as well. **Edit Colors is
the named way into domino editing mode** — double-clicking the row or the element does exactly the
same thing, and all three gate on `isDominoEditable`. It is *hidden* rather than disabled when the
type declares no such mode, matching the build-plan items below it.

### three.js / R3F boundary

`designer/DesignerCanvas.tsx` is the R3F `<Canvas>`: orthographic, top-down, `frameloop="demand"`
(so changes made outside the render loop need `invalidate()` to repaint), and `flat`
(`NoToneMapping`) — the scene is unlit and colours must match their hex values exactly, so R3F's
default film-style tone mapping would only shift them. Note drei's `<OrbitControls>` calls
`invalidate()` on its own `change` event, so ordinary pan/zoom repaints by itself; only imperative
changes you make need an explicit `invalidate()`.

`designer/Scene.tsx` is the **registry-driven scene walker**: it recurses from `rootId` through
`children` and draws each DDObject with the `modeller` its type declares, skipping types that
declare none. It lives inside the `<Canvas>` so its store subscriptions drive R3F's repaint.
Adding a drawn DDObject type never means editing `DesignerCanvas`.

`designer/CameraRig.tsx` is the **single bridge** between DOM UI and the three.js camera. It lives
inside the `<Canvas>` and registers an imperative `CameraApi`
(`zoomBy`/`zoomTo`/`resetZoom`/`frameDDObject`) into the store; UI outside the canvas must go
through it rather than touching the camera. It fits the view to whatever footprint the root
DDObject's `bounds()` reports (shallow-subscribed, so renames and recolors don't re-run the fit),
and warns once if the root declares none.

`frameDDObject(id)` fits any DDObject declaring bounds, and has exactly two callers, both domino
editing mode's: `enterDominoEditing` (per-domino work at build-plane zoom is unusable) and
`Toolbar`'s fit button, which frames the edited field rather than calling `resetZoom` while the
mode is on — fitting the whole plane there would zoom out of the very thing the mode exists to work
on. It is deliberately **not** wired to the selection model. It is also the only fit applying
`FRAME_FILL`, a margin keeping the framed object off the canvas edge; the initial fit and
`resetZoom` stay edge-to-edge, so Reset Zoom always lands on exactly the same view. Nothing
restores the prior view on leaving the mode — Reset Zoom is the way back out, by design.

**`controls.minZoom` is deliberately *not* the fit-the-plane zoom**, but `MIN_ZOOM_FILL` times it,
so the plane can be zoomed down to a fraction of the viewport. It was the exact fit once, on the
reasoning that nothing worth looking at lies outside the plane; image mapping made that false,
since a picture may hang off the plane and its resize handles then can't be reached. A floor is
still kept rather than dropped, so the build can't be zoomed away to an unfindable speck.

### Domino editing mode and its swatch panel

Double-click a domino-editable DDObject — on the canvas, or its row in `DDObjectsPanel.tsx` — to
enter domino editing mode. `enterDominoEditing` sets `dominoEditingId` and switches `activeTool` to
`"editDominoes"`, a `ToolId` with **no toolbar entry**; double-click is the only way in.

**That one `activeTool` value is deliberately enough on its own** to disarm
`SelectionTool`/`CreateByRegionTool`/`onPointerMissed` (none of them match `"select"` or
`"newElement"` any more), to swap `Sidebar.tsx`'s child to the swatch panel, and to replace the
toolbar's Select/New with the mode's own tools. No scattered `dominoEditingId` checks are needed in
those files, and none should be added. The mode is **fully modal**: only `ModeHintBar`'s Done and
Cancel leave it, never Escape. Undo/redo stay enabled, clamped by the barrier (*Undo/redo*).

Four facts reach outside `designer/` and so are recorded here rather than only there:

- **`resolveDominoExpansion` is the single answer** about how far the Expand toggle grows a domino,
  and its two consumers *must* agree: `dominoes/modeller.tsx`, which draws the domino, and
  `designer/DominoEditor.tsx`, which hit-tests it. If the render grows and the rect predicates
  don't, a rubber band visibly cuts through a domino without taking it. It is **imperative on
  purpose** — it builds a fresh object, so using it as a `useStore` selector is the `useShallow`
  trap.
- **Three colours carry meaning in the mode, and they are assigned as a set** across three folders:
  white for dominoes being taken into the selection (a selected domino's outline in
  `dominoes/modeller.tsx`, an adding gesture in `shape-select/preview.ts`, and a brush's nib, which
  reads that same style), dark for an Alt gesture giving them back, and a third darker grey for an
  unselected domino's outline. **None of them may be an actual colour** — they must stay neutral so
  they don't bias the user's own colour choices.
- **Selection commands that produce a whole set at once** — select all, invert, and the swatch
  menus' four modes — live in `dominoes/appStoreSlice.ts`, not in the designer, since a toolbar
  button and a menu item both need them.
- **`DominoEditor.tsx`'s keydown handler returns early on every Ctrl/Cmd chord**, so all of them
  reach `DesignerScreen.tsx`'s one dispatcher instead of being swallowed as shortcut-buffer
  entries. Keep that early return unconditional — it is why the clipboard and Ctrl+A needed no
  change to the mode's keyboard handling at all (*The clipboard*).

**Everything else is in [`frontend/src/designer/CLAUDE.md`](frontend/src/designer/CLAUDE.md)** — the
mode's toolbar group and the Expand toggle, the mode outline, per-domino selection and its two
corner indices, the Ctrl/Alt gesture mode, the two rectangle predicates, live rubber-band preview
and stranded bands, and the whole of the swatch panel: `pickDominoSwatch` as the single path in,
what a swatch means as a colour write, the accent outline, the shortcut buffer, and the swatch
menus.

### Image mapping

`image-map/` lays a picture over an element, and does **two jobs, only one of which is a mode** —
the distinction the whole folder is organised around, and the one a fresh session is most likely
to collapse back:

- **Showing a picture** is an ordinary overlay of domino editing mode. Every tool keeps working
  over it. This is *tracing paper* — a sponsor's logo laid under the grid and drawn by hand with
  the shape gestures and the paint brushes. Not a mode at all.
- **Mapping its colours** (`imageMapActive`) is a mode: the other tools go disabled, and the
  swatches choose the run's palette instead of painting.

The two were one thing, and splitting them was the point of the change. **Do not re-tie drawing to
`imageMapActive`, and do not re-add click-the-picture-to-select** — both would put back the second
canvas-wide plane whose removal is what makes the split possible.

Two facts reach outside the folder and so are recorded here rather than only there:

- **`underlay.ts` squashes *unpainted* dominoes** so a `"below"` picture draws in front of them,
  and that happens during ordinary editing now. It is only a matter of height — the footprint is
  untouched, so clicking, rubber-banding and shape-selecting reach a squashed domino exactly as
  before. `dominoes/modeller.tsx` is the one file in the shared drawing half that knows about it;
  keep `resolveUnpaintedTopZ`'s signature a plain id in and a number out.
- **`dominoes/footprint.ts`'s `dominoFootprintHalfExtents`** — how much build plane a domino owns —
  is shared with `build-plan/`. It lived in `image-map/` until a second consumer needed it; it is
  not about pictures, which is why it moved.

**Everything else is in [`frontend/src/image-map/CLAUDE.md`](frontend/src/image-map/CLAUDE.md)** —
where the picture's rectangle lives and why it isn't the boundary box, the mapping run and its
frozen target set, which colours a run may use, the patch-sample registry, and what is and isn't
undoable about a picture. The two registries it composes with have their own files too:
[`color-distance/CLAUDE.md`](frontend/src/color-distance/CLAUDE.md) (which inventory colour is
nearest) and [`dither/CLAUDE.md`](frontend/src/dither/CLAUDE.md) (which colour gets asked about).

### Build plans

`build-plan/` produces the documents a design has to become before it can be built: the **Layout**
(a picture of the element, one cell per domino, in colour, with a legend number in each), the
**Sort Plan** (each row as run-length runs of colour, for counting dominoes into stacks in
advance), and **Export CSV** (the same layout as data rather than as paper). The first two are
template-aware, a template being a comb 10–50 teeth wide that a row is slotted into.

It follows the `object-types/` layout, so **adding a document is a folder plus one line in
`BUILD_PLANS`** — `DDObjectMenu` and `BuildPlanDialog` are driven off the map and neither names a
plan. The menu items are gated on *capability*, never on type (`getDominoRowCol` plus a non-zero
domino count), so the build plane is excluded structurally and a future element type is included
the day it declares the same members.

Two things about it belong in the app-wide picture:

- **A build plan is not a document-state change and records no history.** It reads the element and
  writes a file, so there is no undo entry and no operation kind. Don't add one — saving a file is
  not an edit. Its options are settings, in the same class as image transparency.
- **It reads the dominoes' own positions plus the type's raw `getDominoExpansion`**, never
  `resolveDominoExpansion` — a printed plan cannot depend on the Expand view toggle, the same rule
  a mapping run follows.

**Everything else is in [`frontend/src/build-plan/CLAUDE.md`](frontend/src/build-plan/CLAUDE.md)** —
how a finished document reaches the user, why it is HTML and that not being a stopgap, `model.ts`
as the one place a DDObject becomes a plan, how legibility drives page capacity, the sort plan's
measured pages, and the CSV export.

### The clipboard

`clipboard/` is a **generic subsystem, not a domino feature** — domino colors are merely its first
client, and DDObject cut/paste is expected to be its second with no change to that folder. Two
seams do the work:

- **Which context handles a command is a registration, not a registry.** `clipboard/store.ts` holds
  one slot (`item: ClipboardItem | null`) plus a `cutCopyHandler`/`pasteHandler` pair that the
  active context installs on mount and clears on unmount. This is deliberately *not* the
  `DD_OBJECT_TYPES` pattern: which handler is correct depends on live app state, not a type name
  known at module load. The precedent it follows is `CameraRig.tsx` publishing its `CameraApi` into
  the store. The cleanup's **identity guard** (`if (getState().pasteHandler === handler)`) is
  load-bearing — React can mount a replacement registrant before unmounting the old one, and an
  unguarded clear would wipe the newer registration.
- **One keyboard dispatcher, in `DesignerScreen.tsx`,** alongside the Ctrl+Z/Y handler and Ctrl+A.
  Tools do not bind Ctrl chords themselves. This is why `DominoEditor.tsx`'s keydown handler returns
  early on *every* Ctrl/Cmd chord and needed no change when the clipboard or Ctrl+A landed, and what
  makes a future clipboard client zero keyboard code. Note it has no INPUT/TEXTAREA guard of its own
  (unlike `DominoEditor`'s), so it suppresses native Ctrl+C/X/V in any text field outside the
  properties dialog — latent today, since the only such fields are in the dialog, which it excludes.

`copy()`/`cut()` write the slot **only when the handler returns an item**, so a copy with nothing to
take can't blank a good clipboard. A `PasteHandler` declares what it accepts via `canPaste(item)`,
so an item from another context is a silent no-op rather than an error, and
`useClipboardCapabilities()` gives UI a reactive `canCut`/`canCopy`/`canPaste` triple. Those `can*`
methods are imperative reads, so **enablement reactivity comes from handler identity**: a registrant
re-registers a fresh handler object whenever its answers could have changed. Don't add a
capability-version counter — that is what this replaces.

The domino-color clipboard **deliberately survives `exitDominoEditing`** (unlike
`dominoSelectedSwatchId`/`dominoColorShortcut`, cleared there), since the item snapshots its source
DDObject and stays valid across a resize or even a delete. That is what makes field-to-field paste
work.

### Pasting patterns between element types

Cut/copy is generic — indices and colorIds straight off the SoA columns, no per-type hook. **Paste
is where types differ**, resolved in two steps that must not be conflated:

1. **`dominoRowCol(ddObject, flatIndex)` / `dominoIndexAt(ddObject, row, col)`**
   (`object-types/base.ts`) map a domino to its parent's own row/column-like ordering and back.
   Nearly every planned type is row/col-like under some reading — a field literally is; circles and
   spirals are polar (`col` = rings out from the centre, `row` = position around); a line is row 0,
   col 0..n — which is why this, and **not** millimetre positions, is the interchange format. A
   mm-space pattern would have to be quantised onto the destination's lattice anyway, and would
   look wrong doing it.
2. **`dominoes/rowColPaste.ts` is one generic algorithm** over those hooks — corner correlation,
   tiling, truncation, holes — used for *every* type pair. It touches source and destination only
   through the hooks, so a field pastes into a spiral with nothing in it knowing either exists.
   `resolveDominoColorPaste` runs it unless the destination declares the optional
   `pasteDominoColors` override; nothing declares one today.

Consequences worth not reversing:

- **`dominoIndexAt` returning `undefined` is the per-type control over edge behavior.** A field
  rejects out-of-range so a stamped pattern clips at the boundary; a ring type would wrap `row` all
  the way around while still rejecting an out-of-range `col`. Don't add an "edge mode" parameter.
- **`dominoCellId` and `dominoRowCol` are different contracts and must not be merged**, even though
  `fieldElement` computes both from one shared decode. `dominoCellId` is an opaque identity that
  must *survive a resize* (hence anchor-relative); `dominoRowCol` describes the layout as it is
  right now. Collapsing them breaks color memory in one direction or pattern geometry in the other.
- The mapping must be **structurally meaningful**, not merely a bijection: dominoes adjacent in the
  physical layout differ by 1 in exactly one coordinate. A mapping that merely enumerated dominoes
  would satisfy the inverse law and paste noise.
- For planar types `row` increases toward what the user sees as **up** — `fieldElement`'s row 0 is
  its *bottom* row — so paste's correlation corner is `(max row, min col)`, the visual upper-left.
  Getting this backwards mirrors every paste vertically.

### Element placement and creation

Placement tools draw their element onto the build plane rather than dropping a default one.
`designer/CreateByRegionTool.tsx` is **fully generic** — it imports no concrete DDObject type, only
the registry — which makes it the pattern to copy alongside `Scene.tsx` and `CameraRig.tsx`:

- It lives **inside** the `<Canvas>`, because a region has to be read in build-plane millimetres
  and a raycast gives exactly that: `event.point`'s world X/Y *are* build-plane coordinates, the
  plane's origin being the world origin.
- Its pointer-catching plane is `transparent` with `opacity={0}`, **not** `visible={false}`, which
  would opt it out of raycasting entirely. It is sized and clamped to the root's footprint via
  `getDDObjectBounds`, never a cast to a concrete root type.
- It arms only when the placement tool is active **with a type armed** and **no properties dialog
  is open**. The dialog guard is load-bearing: the dialog is modeless and the canvas stays
  interactive above its scrim, so without it a user could drag behind the open dialog and two
  Escape handlers would fight.
- Drag state is component-local; only the finished rectangle reaches `createElement`. Escape
  mid-drag clears the start ref, which is also what makes the pending pointer-up a no-op.
- **The rectangle-to-DDObject mapping is the type's own concern**, via
  `createFromRegion?(region: Bounds): Partial<T> | undefined` on its definition, read through
  `getDDObjectCreateFromRegion`. `undefined` means the region was too small or invalid and the tool
  discards it like a cancelled drag. It has to be per-type because each type shapes position and
  size differently — `buildPlane` has no position at all, `fieldElement` splits it into `position`
  plus `width`/`height` and initialises its anchor from the region's corner. There is deliberately
  **no richer create/update/finalize protocol**: the drag preview is a plain rectangle and the
  DDObject isn't created until mouse-up, so nothing needs a live per-type preview mid-drag.
- `designer/ModeHintBar.tsx` prompts the user from the armed type's `placementHint`. Adding a
  placement tool means filling that field in, not editing the hint bar — it names no type.

The hint bar has three other states, ordered most-specific-first in one `if`/`else` chain: domino
editing mode's own bar, then the placement prompt, then Select's idle hint. **The idle hint splits
on `selectedDDObjectId`** — with something selected it names what can be done to it, with nothing
selected it says how to select, and with an empty build plane it points at New. Three sentences
from one store read, and the only place the app says the selection handles are draggable at all.

#### One tool for every element type

`ToolId` is `"select" | "newElement" | "editDominoes"`. It deliberately does **not** carry a member
per placeable type (it once carried `"field"`), for the same reason neither `dominoShapeSelectId`
nor `dominoBrushId` is a `ToolId`: `activeTool` answers *which mode am I in*, and the variant
chosen within that mode is a separate value. Those last two are sub-modes of the *same* mode and
mutually exclusive, expressed by each slice's setter clearing the other's field — a cross-slice
write needing no import either way, since `set` is typed against the whole `AppState`.

- **`newElementType: DDObjectType | null`** holds the armed type, and is null whenever `activeTool`
  isn't `"newElement"`. Every write that leaves the tool maintains that — `setTool`,
  `enterDominoEditing` (reachable while placement is armed, since a sidebar row's double-click
  works whatever tool is active), and the creating branches of `saveProperties`/`cancelProperties`.
- **`setTool` cannot arm it.** Its parameter is `Exclude<ToolId, "newElement">`, so
  `startNewElement(type)` is the only way in and "placing, but with nothing to place" is not
  representable. Don't widen that signature back.
- **`PLACEMENT_TOOLS`** ([toolConfig.ts](frontend/src/designer/toolConfig.ts)) is the one place a
  placeable type is named. It **carries no `id`** — the element type *is* each entry's identity —
  and supplies only what the registry can't: a short menu `label` and the `placementHint`. The icon
  comes from `getDDObjectIcon`, so a type can't appear under one glyph in the New menu and another
  in the hierarchy panel.

What this bought: `DesignerScreen`'s placement crosshair was `activeTool === "field"` and would
silently not have appeared for a second placeable type; `ModeHintBar`'s hint had the same failure.
Both are now type-driven and correct for a type nobody has written yet.

Creation is registry-driven: `createElement(type, patch)` mints the DDObject under the root and
opens its properties in **creating** mode, tracked by `creatingDDObjectId`. That flag is the whole
difference between creating and editing — **Cancel on a creation deletes the DDObject**, where
Cancel on an edit rolls its properties back — and finishing either way returns the tool to Select.
There is no per-type creation logic in the store.

### Selection and direct manipulation

The store holds a single `selectedDDObjectId` (distinct from `activeTool`, the drawing tool).
`designer/SelectionTool.tsx` is the canvas half and, like `CreateByRegionTool.tsx`, is **fully
generic** — it manipulates any DDObject the registry reports as selectable-with-a-footprint and
names no concrete type. It arms only for the Select tool with no dialog open, so it and
`CreateByRegionTool` are mutually exclusive. It draws a light-gray overlay over the selected
object's `bounds()`, offers **move** (drag the body) and **resize** (drag a corner/edge, opposite
one anchored), and deletes on `Delete`. Selection also happens from the sidebar, and clears on a
click that misses everything (empty plane, off-plane via `onPointerMissed`, blank sidebar, Escape).

Two registry members drive it alongside `bounds()`:

- **`selectable?: boolean`** (default true; the root `buildPlane` sets false — it is the world
  frame, not a movable object), read via `isDDObjectSelectable`.
- **`setBounds?(ddObject, bounds)`** — the write path for move/resize, the manipulation analogue of
  `createFromRegion`, read via `applyDDObjectBounds`. Per-type because each type maps a rectangle
  onto its own fields; `undefined` means too small/invalid and the tool discards that drag frame.
  `fieldElement` splits on whether the size actually changed: a **pure move** shifts `position` and
  the anchor by the same delta and touches nothing else, while a **resize** takes the drag rect
  verbatim and re-derives the counts and origins **absolutely from the anchor** (see *The field's
  anchor model* for why "absolutely" is load-bearing).

Deliberate decisions a fresh session could reverse:

- **Move/resize write live through `updateDDObject`** with no snapshot of their own, exactly as the
  property editors preview. The "before" state undo needs is captured by the caller
  (`dragRef.current.originalObject` here, `editingSnapshot` for the dialog), never by
  `updateDDObject`.
- **Move/resize are clamped to the build plane** — the tool clamps the target rect to the root's
  `bounds()` before calling `setBounds`, matching how `CreateByRegionTool` clamps a new region.
- **The overlay draws with `depthTest={false}` and a high `renderOrder`**, not a tall z, so it
  floats over standing dominoes without the generic tool knowing how tall a domino is. Its pick
  planes stay at low z and still work because dominoes are handler-less meshes that don't stop the
  ray. During a drag a huge transparent catch-plane is mounted so pointer move/up keep arriving
  once the cursor leaves the grabbed handle.
- **A hover cursor must be released when its mesh disappears, not only on `pointerout`.** This is
  the only file that writes a cursor imperatively (`gl.domElement.style.cursor`). R3F derives
  `pointerout` by diffing raycast hits between pointer events, so an object **removed from the
  scene while the pointer is over it never fires one** — and Delete is the worst case, arriving
  from a `keydown` with no pointer event at all. The cursor was then stranded indefinitely, and
  because an inline style on the `<canvas>` outranks the inherited `cursor: crosshair`, the stale
  hand survived even the next placement drag. The fix is `cursorOwnerRef`, a token recording
  *which* mesh holds the cursor, plus one effect that releases it when that owner no longer exists.
  The token is load-bearing: without it the release would also clear a cursor a different,
  still-hovered mesh had since set. Don't replace it with an unmount cleanup on `PickPlane`; that
  fires for every plane that unmounts, hovered or not.

### Undo/redo

`history/appStoreSlice.ts` holds a single unified `undoStack`/`redoStack` over a discriminated
`Operation` union (`create` / `delete` / `transform` / `properties` / `dominoColors` / `imageMap`)
— one stack for every change, not a stack per subsystem. Two independent histories can't preserve
true chronological ordering without rebuilding one timeline anyway. (`structure-designer/` is the
one exception, and for a different reason: it edits a different document. See its own CLAUDE.md.)

`isDDObjectInUndoHistory(id)` scans both stacks for an operation still referencing a DDObject id.
`dominoes/store.ts` and `dominoes/colorMemory.ts` use it to defer freeing a deleted DDObject's
domino data until its `delete` operation is no longer reachable, so undoing a delete restores
colors instead of resurrecting an object whose data was already collected.

Every variant stores **whole-DDObject snapshots**, never per-field patches: a `fieldElement`'s
counts, size, `position`, anchor and origins are all derived from one another by different write
paths, which makes it far too interdependent to diff and reapply piecemeal.

**The commit points are deliberately not where the data first changes.** `updateDDObject` fires
continuously — once per keystroke in the dialog, once per pointermove frame during a drag — and is
never itself a commit. The real commits are `saveProperties()` (covering both an edit session and
a creation, branching on `creatingDDObjectId`, so a creation records the finished object as one
`create` rather than a chain of edits) and `SelectionTool`'s `endDrag(false)` via `recordTransform`.
`removeDDObject` is the exception, already atomic at both call sites, so it records directly. Both
commit points diff before/after (`ddObjectsEqual`, a `JSON.stringify` comparison — cheap because it
only runs at a commit) and push nothing when nothing changed. Cancel and Escape-mid-drag need no
entries: nothing was pushed for a cancelled session, so there is nothing to invert.

**A paint stroke is the one commit point that separates writing from recording.** It writes on
every frame (the user has to see paint appear under the nib) and records once, at `endDominoStroke`
on pointerup — see `paint-brush/CLAUDE.md` for how the per-frame operations fold into the one that
lands.

**Re-entrancy is the load-bearing constraint**: applying history must never itself record, or
inverting a `create` would push a `delete` and corrupt the stacks. The fix is a raw/public split,
not a suppression flag — `removeDDObject` is a thin recording wrapper around the non-exported
`applyRemoveDDObject` (and its inverse `applyInsertDDObjects`), and `undo`/`redo` call the raw
helpers directly. There is no flag for a future instrumented action to forget to check. This is
also why `cancelProperties`'s discard-a-creation path calls `applyRemoveDDObject` directly: that
creation never had a `create` pushed, so recording a `delete` would leave a dangling operation
whose undo would resurrect an object the user explicitly discarded.

A `delete` stores the whole removed subtree plus the *external* parent and index the subtree's root
sat at — a descendant's parent link is already correct in its own snapshot. Undo splices the root
back in at the original index rather than appending, which is what stops deleting a middle sibling
and undoing it from moving it to the end.

#### The domino-editing barrier

**Undo is clamped while in domino editing mode.** `enterDominoEditing` stores whatever is then on
top of `undoStack` as `dominoEditingUndoBarrier`, and `undo()` refuses once that same operation is
back on top — so undo inside the mode reaches back only to the state the field was in on entry,
never past it. `exitDominoEditing` clears the barrier. Only undo needs clamping; redo replays
operations already popped in this session. The Undo button disables at the clamp exactly as it
does on an empty stack.

Without this floor, undo from inside the mode would silently walk back through unrelated
DDObject-level history — nothing else stops a `"dominoColors"` op from being undone outside the
mode, and nothing should.

**The barrier is the operation itself, not an index or a stack depth.** `HISTORY_LIMIT` drops
entries off the *front*, shifting every index while leaving object identity untouched. A
depth-based barrier has to be slid down on every push to compensate, and getting that wrong fails
silently and only in long sessions: once the stack sits at the cap its length stops growing, so a
depth captured there stays at or above the length forever and `undo()` refuses *every* in-mode
edit — while those same edits undo fine the moment the mode is exited. That was a real bug. Don't
"simplify" it back to a number. If in-mode work pushes the barrier off the front the clamp lapses,
which is correct: by then every surviving entry is in-mode work anyway.

**`cancelDominoEditing` is the barrier's second reader.** Where Done commits, Cancel discards,
restoring the field to its state at entry. `ModeHintBar` confirms first, and only when
`hasOperationsSinceBarrier` says there is something to lose. Its wording says the cancel itself
cannot be undone, which is literal: the in-mode history is truncated rather than inverted. Three
load-bearing parts:

- **The rollback is a snapshot restore, not a replay of the undo stack.**
  `restoreDominoColorSnapshot` writes back the `colorIds` column captured at entry. **Do not
  "simplify" this into a loop calling `undo()` until it refuses at the barrier** — that was the
  first implementation and it is quietly wrong: past `HISTORY_LIMIT` in-mode edits the earliest no
  longer exist to be undone, and Cancel returns a *partly painted* field with nothing signalling
  the shortfall. A snapshot is immune to the cap by construction. It covers only `colorIds`, the
  one thing the mode can change; an in-mode feature that moves, adds or deletes dominoes must
  widen it.
- **The restore goes through `commitDominoColors`** like every other colour write, so it inherits
  the `colorByCell` sync — skipping it would let a later regenerate repaint the very colors the
  cancel discarded. The operation it returns is dropped: a cancelled session records no history.
- **The history is then truncated at the barrier** (`lastIndexOf`, which returns `-1` exactly when
  the barrier has aged off the front — in which case every surviving entry is in-mode work and the
  whole stack goes). Truncating without reverting is sound **only because in-mode operations are
  colour changes and nothing else**, which is what `enterDominoEditing`'s `redoStack: []` secures:
  redo is deliberately unclamped, so a leftover pre-mode `redoStack` would let Ctrl+Y replay
  pre-mode work into the mode, which Cancel would then drop without undoing.

## Current state and direction

Deliberate decisions **not** derivable from the code, which a fresh session could otherwise
"correct" backwards.

- **`buildSize` is gone.** The root `BuildPlane` DDObject is the sole source of the plane's size
  and color; `CameraRig`'s fit and `minZoom` read it through the plane's `bounds()`. Do not
  reintroduce an app-level build size. The Settings screen is deliberately empty as a result.
- **Nothing is persisted.** Retiring `buildSize` left the `persist` middleware with nothing to
  write, so it went; the DDObject hierarchy was always excluded on purpose. Every load starts a
  fresh default project. Re-adding persistence means re-wrapping the store and choosing a
  `partialize`.
- **Per-domino colouring exists** (the swatch panel — see `designer/CLAUDE.md`), assigned from
  the inventory rather than a free picker and referenced by id rather than copied as RGB
  (`dominoes/CLAUDE.md`). **Per-domino hiding rides the same `colorId`** as a flag rather than a
  column of its own; a per-domino *delete* is unimplemented and must not be conflated with it.
- **A field's dominoes are regenerated wholesale** whenever a layout parameter changes, but this
  no longer loses colors: `restoreDominoColors` carries them forward keyed by each domino's stable
  `dominoCellId`, across a resize, a remount, or an undo/redo. A future per-domino delete needs the
  same treatment and gets it from the same registry-driven mechanism.
- **The field's anchor model.** A field is described twice over — physically, and by domino counts
  — reconciled by an *anchor*, not a mode flag. There is no `fixed_size`, and no display-unit
  fields; both went because rounding sizes to friendly units corrupted the counts derived from
  them. Four load-bearing decisions, each of which a fresh session would plausibly undo:

  - **`anchorX`/`anchorY` pin the grid; `position`/`width`/`height` only describe the box.** The
    anchor is the field's creation corner and moves *only* under a whole-field translate, never
    under a resize. `originRow`/`originCol` count the rows/columns currently sitting *before* it,
    going negative once the bottom/left edges shrink past it. The grid origin is therefore
    `anchor - origin * pitch`, with exactly one definition — **`gridOriginWorld`**, and
    **`gridBaseLocal`** layering on the half-extents and the `position` subtraction to give the
    row-0/col-0 domino's centre in parent-relative mm. `normalizeField` re-hugs the box to the
    first; `layoutField` places every domino from the second; `snapShapePoint` quantises onto the
    second. Hand-copying that expression a fourth time is how a resize starts moving dominoes.
    This is what lets a resize from *any* edge add or remove rows while every existing domino stays
    put — and, with `dominoCellId` keyed off the same coordinates, keeps their colors attached.
  - **`setBounds` must stay a pure function of `(bounds, anchor)`.** Deriving the counts
    incrementally from the field's own live `rows`/`originCol` is what made dominoes flash in and
    out during a drag: an asymmetric grow/shrink rule applied to state the last frame already
    changed never settles, it oscillates. Recomputing both counts absolutely from the anchor every
    frame is the whole fix. Do not "optimise" it back into a delta.
  - **The box is not the dominoes' bounding box.** After a handle-drag the boundary can sit up to
    one pitch from the outermost dominoes — that gap is the room the next row will appear in, and
    it is deliberately visible. Do not re-snap the box to the grid mid-drag. `normalizeField` is
    the *one* place the two are re-hugged, on an editor edit, which is why it re-derives
    `position`.
  - **Growth and shrink are asymmetric, and the near and far edges use different spacing terms.**
    Growth adds a domino only once a full pitch of room exists; shrink drops one the instant the
    boundary cuts into its body. Measuring outwards from the anchor, the last domino needs no
    trailing gap; measuring inwards from the near edge, every domino needs a full pitch. Documented
    at `signedFitCount` and its four call sites. It delegates its growth branch to `fitCount` so a
    field *dragged* to a size and one *created* at that size agree; only its shrink branch is its
    own, and that one deliberately skips `GEOMETRY_EPS`.
- **The field's geometry maths lives in its `object-model.ts`**, so the per-type folder keeps its
  object-model/editor/modeller shape. `modeller.tsx` therefore imports values from
  `object-model.ts` while that module imports the modeller as a value — a cycle that is benign
  *only* because nothing reads across it during module initialisation. **Never call
  `pitchX`/`pitchY`/`fitCount`/`signedFitCount`/`normalizeSize`/`fitCountsThenSize`/
  `normalizeField`/`createFromRegion`/`setBounds` at module scope.**
- **`extent()` is not interchangeable with a type's `bounds()`**, and never will be. `bounds()`
  reports the **boundary rectangle**, needs no generated dominoes and is always defined; `extent`
  reports where the dominoes actually are, and the two are *expected* to differ after a resize by
  the gap above. Swapping `extent()` in for `bounds()` would silently shrink a field's selection
  overlay onto its dominoes and break `SelectionTool`'s drag maths. Its one caller is the mode
  outline, which can use it precisely because it is decorative — nothing measures a drag against
  it. Note it reports the bounding box of domino **centres**; half-extent and expansion padding are
  the caller's job.
- **`color` is a `"#rrggbb"` hex string** because that is what color-picker controls consume
  directly, including the native `<input type="color">` behind `ColorField` — which is why no
  color-picker dependency was added.
- **Selection exists** (`selectedDDObjectId`), but `CameraApi.frameDDObject` is deliberately still
  not called on select: selection happens constantly and a moving viewport would fight the user.
  Its only caller is `enterDominoEditing`. The row ⋯ menu acts on its own DDObject independently of
  what is selected.
- **Freehand painting exists** (`paint-brush/CLAUDE.md`) alongside the select-then-apply route. It
  is the only route that writes continuously while recording a single undo entry, and the only
  sub-mode whose *size* is a per-variant number rather than a shared one — "Medium" is a different
  reach for the pencil than for the quill, which testing established and a shared table would
  quietly undo.
- **Image mapping exists** (`image-map/CLAUDE.md`, with `color-distance/` and `dither/`) — the
  third route to a domino's colour, and the only one that *chooses* colours rather than being told
  them. Which colours it may choose from is the user's, so the swatches are no longer inert during
  mapping. One thing is the current version's line rather than the design's: a run **assumes
  unlimited dominoes of every colour**, ignoring the inventory's `available` counts. A scoped
  decision, not an oversight to correct quietly.
- **A picture is an overlay first and a colour source second**, and the two were deliberately split
  (see *Image mapping*). **A picture's geometry and its comings and goings are undoable**, over a
  single `"imageMap"` operation; show/hide, transparency and layer deliberately are not, being view
  aids rather than document state. The anticipated mode-scoped undo stack turned out not to be
  needed — the one shared stack took it.
- **Error diffusion exists** (`floydSteinberg` and `atkinson`, see `dither/CLAUDE.md`). The two are
  registered together deliberately: they differ only in their table of weights, and having both is
  what makes the trade between them — faithful on average versus keeping the extremes — something
  that can be looked at rather than argued about. Same reasoning as the two Dominant samplers and
  the two perceptual metrics.
- **A tonal-range pre-pass is the one thing still deliberately absent from the colour choice, and
  it is wanted.** Stretching a picture's own range of light and dark onto the range the inventory
  actually spans is the biggest remaining improvement for photographs, and it is **not** a metric:
  if the darkest active colour is a mid-charcoal, every metric is *correctly* reporting that
  nothing darker exists, and no change of formula recovers the contrast. Don't try to solve it
  inside `color-distance/`. Error diffusion narrows the gap without closing it — it can suggest a
  tone between two the inventory holds, but not one outside the range of every colour in it.
- **Build plans exist** (`build-plan/CLAUDE.md`) — the first thing in the app that leaves it. Three
  decisions there are scoped rather than oversights: a run assumes unlimited dominoes, so the
  legend's counts are a requirement rather than a check against `available`; there is **no PDF
  backend**, deliberately, the browser's print dialog being where the PDF comes from; and **page
  cutting assumes columns map to a rectangle**, true for a field and needing thought for a spiral.
- **Locked-colour mode existed and was deliberately removed.** A swatch could be locked, after
  which *every* selection change repainted whatever it had just selected. It was a pre-brush
  stand-in for a brush, and once real brushes existed it was only a hazard: it made every selection
  destructive, worst of all Ctrl+A. Everything it was good for is covered by Ctrl+drag to extend a
  selection and then clicking a swatch. `dominoSelectedSwatchId` replaced it and is **not** the
  same thing — it stores the choice and nothing else, and only a brush acts on it, only while its
  button is down. Do not propose a lock as an enhancement, and do not restore the pieces that went
  with it: the `RiLockFill` badge, the swatch double-click, the menu's `Lock` item, the derived
  `matchedSwatchId` highlight, or a clear of the selected swatch inside `setDominoBrush`.
- **There is one generic modal, `components/ConfirmDialog.tsx`**, raised by ModeHintBar's Cancel,
  the image menu's replace warning, and image mapping's two explanations. It is owned by whoever
  raises it (local state, mounted inline) rather than by the store — unlike `PropertiesDialog`
  there is no shared editing session behind it, just a question and two callbacks. It is a *true*
  modal, unlike the properties dialog: its scrim dims the canvas too, and it swallows every keydown
  in the capture phase so the window-level handlers behind it can't keep editing the thing being
  asked about. **Omitting `confirmLabel`/`onConfirm` makes it acknowledge-only** — which is what
  keeps it the single modal rather than there being a near-identical second component for telling
  the user something.

## Code style

- Co-located CSS Modules: `Component.tsx` + `Component.module.css`, imported as `styles`.
- Shared design tokens are CSS custom properties (`--color-chrome`, `--color-text-dim`,
  `--color-accent`, `--sidebar-width`, ...) in `src/global.css`. Use them rather than hard-coded
  colors, so new UI matches the existing chrome.
- Icons are React components typed as `RemixiconComponentType` — never string names. Most come
  from `@remixicon/react`; the rest are hand-drawn (`icons/CLAUDE.md`), and the two are
  interchangeable everywhere by design.
- Comments explain *why*, and flag interim decisions ("Stub for v1"). Match that density rather
  than narrating what the code plainly does.

The rules below apply to **code and comments you write or change from now on**. They are not a
licence to reformat what is already here — existing names and comments are worth touching only
when you are editing that code anyway.

- **Write comments in plain language, and say things directly.** Two habits to avoid. First,
  maths and computer-science jargon — *identity*, *idempotent*, *contravariant*, *erasure*,
  *monomorphic* — where an ordinary sentence carries the same meaning; where such a word genuinely
  is the clearest one, explain it in the same sentence the first time a file uses it. Second,
  indirection that makes the reader hold something in their head: "calls the result" forces them to
  work out that the result is a function, where "calls the snap function" just says it.
- **Assume the reader is new to React, react-three-fiber and three.js, and has never written GPU
  code.** That is the actual audience for this codebase's comments and for this file. Say what a
  piece of machinery *is* before saying why it is used: a `<group>` is a three.js node that applies
  its position to everything nested inside it; an *instanced attribute* is one value per copy of a
  repeated mesh, uploaded as an array the GPU indexes by copy number; a *uniform* is one value
  shared by every pixel a shader draws in a pass. `onBeforeCompile`, `depthTest`, `polygonOffset`
  and `raycast` each deserve a clause saying what they do, not just that they are needed. Where a
  comment would balloon, name the concept and point at the section that explains it.
- **Name things in full.** `selectionGestureEvent` over `event`, `snapShapePoint` over `snap`,
  `dominoIndexUnderCursor` over `idx`. Short names are fine only where the line already says what
  the thing is — the `e` of a one-line JSX handler, the `i` of a `for` loop, the `p` of a two-line
  point helper. Anything crossing a function boundary or appearing in an exported signature gets
  the full name.
- **DDObject naming.** Any identifier meaning a DDObject (as opposed to an incidental JS object,
  e.g. three.js `Object3D`) uses the convention: `ddObject`/`ddObjects` for values, `DDObjectXxx`
  for types, `xxxDDObjectXxx` for functions and props (`updateDDObject`, `getDDObjectIcon`). A bare
  `object` should always mean something that is *not* a DDObject.
  **The convention is about what a name *means*, not where it is used.** A general type that a
  DDObject accessor merely returns does not take the prefix — `Bounds`
  ([types.ts](frontend/src/types.ts)) was once `DDObjectBounds`, and the name went wrong the moment
  the same four numbers also described a rubber-band drag, a region drawn to create an element, and
  an image placed over a field. The accessor keeps the prefix (`getDDObjectBounds`) because *it* is
  about a DDObject; the rectangle it returns is not. Per-type union aliases carry the suffix
  (`FieldElementDDObject`). Names already unambiguous through an `Id` suffix (`rootId`, `parentId`)
  are exempt — don't make those stutter.
- **Avoid 'seed' and its variants.** To the project's owner, "seed" belongs to generative
  algorithms that grow large complexity from something small. Use `change`, `initialize`, `set`, or
  `reset` instead.