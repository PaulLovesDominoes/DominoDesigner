# CLAUDE.md — the Structure Designer

Guidance for working in `frontend/src/structure-designer/`. The repo-root `CLAUDE.md` covers the
domino designer and the conventions shared by the whole app; everything specific to this screen
lives here.

## What this is, and what it is for

Three-dimensional domino structures — towers, walls, stacked courses — will ultimately become
elements on the main build plane in the Designer screen. But before that can happen they have to
be *designed*. This screen is where that designing happens. Once designed, a structure can be
sized and placed into a build on the Designer screen, and then painted in the domino editor like
any other element.

Its eventual output is a **JSON description of how to build a structure**, stored somewhere and
later picked up by the main Designer as the pattern a new DDObject is created from. **That JSON,
plus a list of designed structures, is the entire intended coupling between the two halves of the
app.** Everything below follows from that.

## The independence rule

**This screen shares as little as possible with the Designer and Inventory screens**, so the two
halves can change without regression-testing each other. What it shares is only genuinely common
chrome:

- the hamburger menu and the title bar,
- low-level components with no opinion about either half — `HelpPanel`, `FloatingTip`,
  `ConfirmDialog`, `UnitNumberField`, `Steppers`, `PropertyFields`,
- the CSS custom properties in `global.css`, so the two halves look like one app,
- the icon set (`@remixicon/react`).

Everything else is this folder's own, **including things that look duplicated**: the sidebar
chrome, the toolbar chrome and the hint bar are each a separate component with a separate CSS
module holding rules very close to the Designer's. That is deliberate and must not be "cleaned
up" into a shared shell. The two sidebars will hold entirely different things, and the two
toolbars will fill with entirely different tools; a shared shell would make every change to one
of them a change to the other.

The one place this screen reads Designer state is `StructureDesignerScreen`'s keydown handler,
which checks `editingDDObjectId` before acting. That is a guard against a dialog mounted over
every screen, not a coupling — and it reads the value imperatively rather than subscribing, so it
does not re-render this screen when a dialog opens somewhere else.

## The build flag

`enabled.ts` exports `STRUCTURE_DESIGNER_ENABLED`, from `VITE_ENABLE_STRUCTURE_DESIGNER`. The
screen is unfinished, so a published build can hide it completely while the code still ships in
the bundle. `.env.development` turns it on for `npm run dev`; `.env.production` turns it off for
`npm run build`. Both are loaded automatically by Vite for the mode it is running in.

**Off unless the variable is exactly `"true"`.** The failure mode of a wrong guess should be "the
unfinished screen is hidden", never the reverse — so an absent or misspelt variable hides it.

Two enforcement points, and both are needed:

- **`components/HamburgerMenu.tsx`** — `MENU_ITEMS` entries carry an optional `enabled`, filtered
  on render. A general mechanism, not a named special case, so the next unfinished screen reuses
  it.
- **`App.tsx`** — the `SCREENS` entry is only spread in when the flag is on, and `App` falls back
  to the designer for a screen with no entry. Without this the flag would only hide a menu item;
  with it there is no way to show the screen at all.

Vite replaces `import.meta.env.VITE_*` with a literal at build time, so all of the above folds
away: in a flag-off bundle the constant is `false` and the `SCREENS` object literal genuinely has
no `structureDesigner` key.

## State: a store of its own

`store.ts` here is `useStructureStore`, a zustand store **separate from the app store in
`src/store.ts`**.

The root `CLAUDE.md` says only *a different mutation discipline* earns a store of its own, and
that ordinary copy-on-write feature state becomes a slice instead. **That rule is about features
inside the domino designer, and this is a considered exception to it** — do not "correct" this
into an `appStoreSlice.ts`. The reasons:

- It is what makes the independence rule structural rather than a promise. `src/store.ts` is not
  touched at all by this screen, so nothing on the Designer side can reach in here by accident.
- It keeps this screen out of `store.ts`'s import cycle entirely, and out of the rule that
  `store.ts` must be the only importer of a slice's creator.
- A feature owning its store already has precedent: `dominoes/store.ts`, `clipboard/store.ts`,
  `image-map/assetStore.ts`.

**Members are not prefixed with `structure`** — the store already names the domain, so call sites
read `useStructureStore((s) => s.layer)`. Adding the prefix back would stutter at every use.

`setLayer` clamps, and **the clamping lives there rather than at the call sites**, so every route
in — the slider drag, its arrow keys, and whatever is added later — is clamped once.

## History is its own stack

`undoStack`/`redoStack`/`undo`/`redo` live in this store, deliberately not in
`history/appStoreSlice.ts`.

The root `CLAUDE.md` records a decision *against* per-subsystem history stacks, because two
stacks cannot preserve one chronological order. **That argument is about two subsystems editing
the same document.** Here there are two documents — the domino build, and a structure's JSON — and
sharing one stack would mean Ctrl+Z on this screen silently changing a domino build the user
cannot see. That breaks the stronger rule the root file also records: *the consequence of an undo
or a redo must always be visible.*

**The undo record is `StructureUndoEdit`, and it is not the same thing as a `StructureOperation`.**
An *operation* is an item in the document — a step in the recipe. An *edit* is one undoable change
to that document, and its three members are `create` / `delete` / `properties`. The two words were
one word in the shell, where `StructureOperation` meant the undo record and nothing else existed;
`undoStack: StructureOperation[]` beside `operations: StructureOperation[]` would have been
unreadable, so the undo union took the longer name. Both stacks hold whole-operation snapshots,
never per-field patches, for the same reason the Designer's history does.

`HISTORY_LIMIT` and `pushUndoEdit` **arrived with the first thing that needed them**, which is what
this file always said to wait for — four commit points now have to cap the stack and clear redo
identically (`saveOperationProperties`, `removeOperation`, and both branches of `placeDomino`). They are declared **locally rather than imported** from `history/appStoreSlice.ts`:
the independence rule makes that import a hard no, and a nine-line helper is not worth a coupling
that has to be reasoned about later.

Three pieces of the Designer's history deliberately did **not** come across, and each would be
reserved machinery with no reader here (the root file's `hidden: Uint8Array` column is the standing
warning):

- **The undo barrier.** `dominoEditingUndoBarrier` exists to clamp undo inside a modal sub-mode.
  This screen has no such mode. What it has instead is a guard in `StructureDesignerScreen`'s
  keydown handler: Ctrl+Z does nothing while an operation's dialog is open, so `undo` and `redo`
  never have to reason about one.
- **A neutral `ddObjectOps.ts`-style module.** That exists to break the app store's slice import
  cycle. This store has no slices and no such cycle, so the raw list helpers are module-private
  functions in `store.ts` itself. They are still what `undo`/`redo` call, for the reason that
  matters: applying history must never itself record history, and a helper that cannot reach an
  action cannot accidentally record one.
- **A re-entrancy flag.** There is none, and there should not be — the raw/public split above is
  the structural version of it.

## The structure is a list of operations

The document this screen edits is `operations: StructureOperation[]` — an ordered list of steps for
building a structure. `StructureOperationBase` gives every one an `id` (`"SOP-#"`, minted from
`nextOperationNumber`), a `name` and a `type`.

**It is an ordered array, not a record keyed by id, because the order carries meaning.** The first
layer definition describes the layers from layer 1 upward and the next carries on where it left
off, so a step's position *is* part of what it says. That is also why the `create` undo record
stores an index alongside the operation, exactly as `delete` does: undoing and redoing a creation
has to put it back in the slot it came from, and appending would quietly reorder the recipe.

Nothing under `operation-types/` imports from `src/` outside `dimensions.ts`. Keep it
that way.

`operations` is copy-on-write like the rest of this store — every action returns a new array rather
than mutating one — which is what makes it usable as a `useMemo` dependency (see *Layer heights*).

Three words are worth keeping straight, because two of them were the same word in the shell and the
third is easy to get backwards:

- **operation** — an item in the document. **undo edit** — one undoable change to it.
- **modifying**, not editing, for the open dialog: `modifyingOperationId`, `modifyingSnapshot`.
  Again to keep the dialog's session verbally clear of the undo record.
- **length**, not height, for a standing domino's tall dimension — it is `DOMINO_SIZE.length`, and
  the Type pull-down reads "Length (48mm)". A *layer* has a height, and those are different
  quantities. Calling both a height is how a 48 becomes a 24.

The sidebar's list used to be called the instructions; that word is retired.

## Junction points

A **junction point** is somewhere a domino can be stood, and the segments between neighbouring
junctions are where dominoes lie. They are drawn as dots on the layer sheet, and a placement drag
snaps to them — see *Placing dominoes*.

Three decisions here that the code alone will not tell you:

- **Every layer always has a grid, defined or not.** `gridForLayer` provides it; a layer no
  definition reaches gets `DEFAULT_GRID` — plain rows and columns a domino-length apart.
- **Grid definitions stack per layer exactly as layer definitions do**, each covering as many layers
  as its Layers setting says. That control is labelled *Layers* and not *Repeat*, because a grid
  already repeats in X and Y; the field is still `repeat`/`repeatCount`, shared with the layer
  definition through `operation-types/repeat.ts`.
- **The dots are drawn on one layer only.** Show All Layers does not multiply them — a hundred
  layers of a dense grid is a hundred times the dots for a picture that reads as fog.
- **Every junction is drawn, including one with a domino on it.** A buried dot is hidden by the
  domino standing on it, through ordinary depth testing, so filtering them out by hand was tried and
  removed as work the graphics card already does. What *is* suppressed is the placement tool's
  **mark**, which draws with `depthTest` off and would otherwise paint over the very domino making
  the junction unusable. `useLayerJunctions` returns the whole grid plus a blocked mask rather than
  only the free dots, so the tool can tell that a press landed on a buried junction instead of
  snapping it somewhere else.
- **Every pattern is a lattice plus a basis** (`operation-types/gridDefinition/geometries.ts`), which
  is what lets one generator serve all six without knowing what an octagon is. Adding a tiling is a
  table entry there.
  
## Geometry and constants

`constants.ts` holds everything the screen measures or paints with, so the canvas, the camera and
the layer control cannot disagree. Units are millimetres, one three.js unit to the millimetre,
matching the rest of the app.

The build plane is (for now) fixed at 1.5m square in a light grey-blue, chosen to be unmistakably not the
Designer's warm tan. Note, not a DDObject, nothing inside the structure-designer has anything to do with DDObjects, which are the domain of the main designer screen.

Layer heights are the user's, set by the layer definitions in the sidebar, so `DEFAULT_LAYER_HEIGHT_MM`
is what a layer no definition reaches falls back to. Both the layer plane and a definition's preview
must work their heights out through `operation-types/layerDefinition/layers.ts` — that file explains
why it is not a registry hook, and `useLayerHeights.ts` explains why it must never be a store
selector.

## The layer plane sits at z = 0 for layer 1, and that needs `polygonOffset`

Layer 1 is the *floor* of the first course, so its grey sheet lies exactly on the build plane.

**`StructureBuildPlane`'s material carries `polygonOffset`, biasing it away from the camera.**
`polygonOffset` biases depth in the
depth buffer's own units with a slope-scaled term, it solves the viewing shimmer with two planes fighting
to be displayed and it holds at any angle.

**Applied always, not only at layer 1.** Nothing else in this scene lies in that plane, so at
every other layer the bias changes nothing visible, and a condition would only be one more thing
to get wrong.

`LayerPlane` is **semi-transparent rather than solid** so that dominoes placed underneath are still visible.
This will become more important in future updates.

It is `depthWrite={false}` (a see-through surface must not record its
own depth) and `DoubleSide` (so it does not blink out at a near-horizontal tilt).

## The camera is Z-up, and that is load-bearing

`StructureCameraRig` sets `camera.up.set(0, 0, 1)` before the first `controls.update()`.

OrbitControls swings the camera around whichever axis the camera calls "up", and three.js defaults
that to **+Y**. This app's world is **Z-up**: the build plane lies in X/Y (to be more in line
with the conventions used by domino builders and potential future software developers contributing to this
project) and structures grow into
+Z. Left at the default, dragging up and down rolls the scene sideways instead of tipping it away
from straight-down, and `maxPolarAngle` stops meaning what it reads as. If a vertical drag ever
starts tumbling the view, this is the line that went missing.

It is safe to set after construction because three-stdlib's `OrbitControls.update()` recomputes
its up-axis rotation from `object.up` on every call.

Starting exactly straight-down puts the camera at the pole of the orbit, which OrbitControls
handles with its own epsilon clamp; the resulting offset is far below a millimetre and invisible.

## Shift+Right-drag rotates; plain Right-drag pans

`StructureCanvas`'s `ShiftRotateGesture` does that with a **capture-phase** `pointerdown` listener
on the canvas element. Capture is what makes the ordering certain — a browser delivers an event
outermost-first on the way in (capture) before working back out (bubble), and OrbitControls
listens the ordinary way, so this always runs first.

**Deliberately not React state flipped by watching the Shift key**, which would re-render the
canvas every time Shift was pressed or released.

`StructureDesignerScreen`'s canvas area must keep its `onContextMenu` guard: right-dragging is the
pan gesture, so without it the browser's own menu opens on every pan.

## Placing dominoes

A left-drag from one junction toward another places a domino. `DominoPlacementTool` is the gesture,
`PlacedDominoes` + `DominoBatch` draw the result, and
`operation-types/dominoGroup/dominoes.ts` holds every piece of arithmetic either of them needs —
pure, React-free and three.js-free, so the eventual JSON exporter reads it too.

Decisions here that a fresh session would plausibly undo:

- **There are two canvas tools now, and there deliberately were none.** `tool` is
  `createDominoes` or `rectangleSelect`, and the first release had neither: placing was the only
  thing the left button could do. A rubber band needs that button, which is what changed it.
  **The orientation buttons are not a third tool** — they say how a placement goes down, so one of
  them and one tool are chosen at the same time.
- **Every orientation is one line of the same table.** `DOMINO_ORIENTATIONS` holds only the box's
  size along (u, v, w), where u runs from one attachment point to the other, v is u turned a
  quarter-turn, and w is up. The span between the attachment points, the offset to the box's centre,
  and how tall it stands are all derived from those three numbers.
- **Escape belongs to the tools, not to the screen's keydown handler.** Only the tool running a drag
  knows whether there is one to abandon first, so `structureToolForKey` answers to single letters
  only and `DominoSelectTool` owns the ladder: abandon a band, else go back to placing.

### Dominoes may not occupy the same space

`operation-types/dominoGroup/overlap.ts` is the whole of that rule, and it is exact — real boxes,
any penetration refused. **Two dominoes therefore cannot be laid end to end at neighbouring
junctions of either overlap grid**, because a domino is 48mm long while its attachment points are
40.5mm apart. That is not a fault to be tolerated with an epsilon: a course of real dominoes always
has gaps, and what closes a gap is a bridging domino on the layer above. The overlap spacings exist
for that relationship between layers, not for a run along one.

Nothing in the test knows about layers. A box carries its own floor and top, so an upright reaching
two courses up is compared by the same two numbers as anything else — which is why the "sticks up
into higher layers" case needed no special handling.

`useDominoBoxes` builds every domino as a box once and caches it outside React, because four
components want the list and a structure runs to tens of thousands. `spaceIndex.ts` sorts them by
position for **one** caller, hiding buried junctions, which is the only question asked of every
junction against every domino; everything else walks the list.

### How a domino is stored

`PlacedDomino` records **both attachment points and no angle**, plus a `DominoAnchorKind` per point
saying whether it landed on a junction. This was chosen as the simplest and most accurate of several alternatives, and also the easiest for dominoes on layer N to provide junction points for dominoes on layer N+1.

### Dominoes are in dominoGroup operation properties

Dominoes live in the domino group operation's own fields, so deleting a group deletes the dominoes
with it and no separate bookkeeping is needed.

**Undo records the dominoes that moved, not the group.** `dominoesAdded` and `dominoesRemoved` are
the two `StructureUndoEdit` kinds that break this store's whole-operation-snapshot rule, and they
have to: a before-and-after pair of a thirty-thousand-domino group costs a pointer per domino per
entry, for edits that touched one piece each. Creating and deleting a group are still whole
snapshots, because those already cost nothing — the snapshot holds the same `dominoes` array by
reference.

### Selection is positions, and it is view state

`selectedDominoes` is a set of positions in the group's own list. **Cleared by undo, redo and
delete** — the three things that renumber the list — and by nothing else, since placing appends. An
id on `PlacedDomino` would be a field on the shape written out as JSON, in service of something that
never leaves the screen.

**The dominoes carry no pointer handlers**, and must not be given any: `dominoPicking.ts` casts the
event's own ray against the boxes instead. Handlers would cost a hit record per instanced copy, and
would put a wall in front of the invisible plane both tools measure the pointer against.

### `dominoGroup` is a folder plus *two* registry lines

The first dominoGroup is created automatically when a domino is added. There is no toolbar command. The count of dominoes in a domino group is specified in the sidebar with the goup. There are no editable properties in a dominoGroup at this time. Future versions envision properties for replicating and conditionalizing groups.

`PlacedDominoes` goes the other way and *is* a direct reach into the dominoGroup folder for now. If additional things are constructed, a `sceneContent` hook may be recommended, parallel to the current `preview`.

### Drawing

`DominoBatch` is one `InstancedMesh` for every cream face plus one merged `LineSegments` for every
edge — two draw calls whatever the count, affordable because the merge only happens on a placement,
a delete or an undo (never during dragging or rotating). Nothing needs `frustumCulled={false}`.

**The outline's colour is a vertex attribute, not a material.** A merged outline per colour would
have to be rebuilt whole every time the selection changed, and the selection changes on every frame
of a rubber-band drag. So there is one outline geometry and a colour per corner point, refreshed for
the dominoes that changed and sent across as update ranges. That is also why `DominoMeshes` converts
both edge colours from sRGB by hand: a colour written into a buffer is not converted for you.

## The layer control

`LayerSlider` is a line with a dot on it in a column of its own to the right of the canvas — the
idiom of a 3D-printer slicing program's layer scrubber. It is a column rather than an overlay so
it never covers the view and the canvas keeps its whole area for the tools this screen will grow.

## Adding to this screen

- New state goes in `store.ts`, not in a slice of the app store.
- New chrome gets its own component and its own CSS module in this folder — resist reaching for
  the Designer's.
- **Adding an operation type is a folder under `operation-types/` plus three lines.** The folder
  holds an `object-model.ts` (the data shape and the `StructureOperationDefinition`), an
  `editor.tsx`, and whatever else that type needs — a `preview.tsx` if it has something to show on
  the canvas. Two of the lines are in `operation-types/registry.ts`: the entry in
  `STRUCTURE_OPERATIONS` and the member in the `StructureOperation` union. The third is an
  `<OperationCommand type="…" />` in `StructureToolbar`. **Nothing else is edited**: the sidebar
  list and its ⋯ menu, the properties dialog, the warning banner, the canvas preview and the whole
  of undo/redo go through the registry's accessors and none of them names a type.

  **A type created by a gesture rather than a command is two lines, not three** — it has no toolbar
  button, so `toolbarLabel` is optional. `dominoGroup` is the one such type today; see *Placing
  dominoes*.
 
- When the JSON description lands, it is the boundary with the rest of the app. Keep it a plain
  data structure that the Designer can read without importing anything from this folder.
  `operation-types/` is already that shape: every field of every operation is a string, a number,
  or an array of those.

Four decisions a fresh session would plausibly "correct", and shouldn't:

- **The two Deletes follow different rules**, though both ask nothing first. The sidebar ⋯ menu's
  Delete removes a whole operation and records its own undo entry. The trashcan inside the Layer
  Heights list removes a row from the operation being edited, and is covered by that dialog's
  single Update or Cancel — not by an undo entry of its own.
- **The sidebar has no selection.** Nothing on this screen would do anything with a selected
  operation yet, and a selection nothing reads is state waiting to go stale. Reordering the list is
  the obvious thing that wants one, and it should arrive together with the click-blank-space-to-
  deselect that has to come with it.
- **`createOperation` appends.** Inserting next to the layer being viewed is a plausible refinement
  and deliberately not done: the list reads as a recipe, and a new step landing in the middle of one
  would be a surprise.
- **The Layer Heights list's blank trailing row is not stored.** The editor always draws one below
  the real rows, and choosing a type in it is what appends a real one. That is what keeps
  `LayerHeightKind` a closed set with no "nothing chosen yet" member for the rest of the code to
  handle.