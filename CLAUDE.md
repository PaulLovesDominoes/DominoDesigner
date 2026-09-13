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

### Never edit a source file through the shell

Use the editing tools. **PowerShell in particular will corrupt a file it round-trips**, because `Get-Content`/`Set-Content` (and `Out-File`) disagreeing about text encoding. Also Powershell 5.1 reads a file with no BOM as ANSI, when writing back as utf8 em-dash on disk becomes `â€"`. Also do not "git checkout" to repair it (that erases all uncommitted changes).

### Serving the Production Build Through FASTAPI server

```
cd frontend && npm run build
cd ../server && pip install -r requirements.txt
python -m uvicorn main:app --reload   # or server.bat, from the repo root
                                      # -> http://127.0.0.1:8000
```

### Deploying

The built frontend is published to Firebase Hosting at https://domino-designer.web.app, from the
laptop. It needs the Firebase CLI (`npm install -g firebase-tools`) and a one-time `firebase login`.

```
deploy.bat           # the live site; refuses if the working tree is dirty
deploy.bat preview   # a temporary URL, expiring in 7 days; a dirty tree is fine
```

`firebase.json` and `.firebaserc` at the repo root configure it, and `frontend/dist` is what gets
uploaded. `deploy.bat` is a launcher; the script itself is `deploy.ps1`, in PowerShell because
batch eats the percent signs in git's `--pretty` format strings. Three things about it are
load-bearing:

- **The script pins `VITE_ENABLE_STRUCTURE_DESIGNER=false` in the environment**, which Vite ranks
  above every `.env` file — including a personal `.env.local` turning the unfinished screen on for
  local work. That is what stops it reaching the published site by accident.
- **`index.html` is served `no-cache`, `/assets/**` `immutable`.** Vite puts a content hash in every
  asset filename, so those files can be cached forever, and a deploy takes effect the moment the
  uncached index.html is fetched again. Letting index.html be cached instead is how a browser ends
  up asking for a bundle that no longer exists.
- **There are no rewrites**, because screens are a store registry rather than URLs. The site is one
  page and every other path is a genuine 404.

A live deploy labels its release with the commit it was built from, so the Firebase console's
release list lines up with git history and a rollback is one click.

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

- **`ddObjectOps.ts`** holds the pure hierarchy operations (`applyRemoveDDObject`,
  `applyInsertDDObjects`, `collectSubtree`, `ddObjectsEqual`) that both `store.ts`'s recording
  actions and history's `undo`/`redo` need. A neutral module is what lets history avoid a value
  import from `store.ts`, and it makes the raw/public split structural: a module that cannot reach
  an action cannot accidentally record one (see *Undo/redo*'s re-entrancy note).

Screens are a registry, not a router: `ScreenId` -> component in `App.tsx`, plus a `MENU_ITEMS`
entry in `components/HamburgerMenu.tsx`. **A screen component lives in its own feature's folder** —
`designer/DesignerScreen.tsx`, `domino-inventory/DominoInventoryScreen.tsx`. There was a `screens/`
folder holding them all; it was retired because a screen is the root of its feature rather than a
thing of its own. Two details of the registry:

### The DDObject hierarchy and its extensibility contract

The build's contents are a **flat registry of DDObjects indexed by id** with levels and a root ID.

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

See `object-types/registry.ts` for information about how these types are registered and consumed through accessors.

### three.js / R3F boundary

`designer/DesignerCanvas.tsx` is the R3F `<Canvas>`: orthographic, top-down, `frameloop="demand"`
(so changes made outside the render loop need `invalidate()` to repaint), and `flat`
(`NoToneMapping`) — the scene is unlit and colours must match their hex values exactly, so R3F's
default film-style tone mapping would only shift them. Note drei's `<OrbitControls>` calls
`invalidate()` on its own `change` event, so ordinary pan/zoom repaints by itself; only imperative
changes you make need an explicit `invalidate()`.

`designer/Scene.tsx` is the **registry-driven scene walker**: it recurses from `rootId` through
`children` and draws each DDObject with the `modeller` its type declares, skipping types that
declare none. 

`designer/CameraRig.tsx` is the **single bridge** between DOM UI and the three.js camera. 


### Domino editing mode and its swatch panel

[`frontend/src/designer/CLAUDE.md`](frontend/src/designer/CLAUDE.md) for more information
 
### Image mapping

See [`frontend/src/image-map/CLAUDE.md`](frontend/src/image-map/CLAUDE.md) for more information.

### Build plans

See [`frontend/src/build-plan/CLAUDE.md`](frontend/src/build-plan/CLAUDE.md) for more information.

### The clipboard

`clipboard/` is intended to be a **generic subsystem, not a domino feature**

- **Which context handles a command is a registration, not a registry.** See `clipboard/store.ts` for more information.

- **One keyboard dispatcher, in `DesignerScreen.tsx`,**

### Keys, clicks and the platform

`src/platform.ts` is the single answer to *which machine is this* (including what browser engine) and *what are the keys called on
it*.

### Selection and direct manipulation

The store holds a single `selectedDDObjectId` (distinct from `activeTool`, the drawing tool).
`designer/SelectionTool.tsx` is the canvas half and, like `CreateByRegionTool.tsx`, is **fully
generic** — it manipulates any DDObject the registry reports as selectable-with-a-footprint and
names no concrete type. It arms only for the Select tool with no dialog open, so it and
`CreateByRegionTool` are mutually exclusive.


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

**`cancelDominoEditing` is the barrier's second reader.** Where Done commits, Cancel discards,
restoring the field to its state at entry. `ModeHintBar` confirms first, and only when
`hasOperationsSinceBarrier` says there is something to lose. Its wording says the cancel itself
cannot be undone, which is literal: the in-mode history is truncated rather than inverted. Three
load-bearing parts:


## Current state and direction

Deliberate decisions **not** derivable from the code, which a fresh session could otherwise
"correct" backwards.

- **Nothing is persisted.** Retiring `buildSize` left the `persist` middleware with nothing to
  write, so it went; the DDObject hierarchy was always excluded on purpose. Every load starts a
  fresh default project. Re-adding persistence means re-wrapping the store and choosing a
  `partialize`.
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