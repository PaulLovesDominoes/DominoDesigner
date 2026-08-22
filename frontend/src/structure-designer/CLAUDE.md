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

**Help hides itself for free, and that is worth not breaking.** `help/topics.ts` finds topics by
globbing the content folder, and `HelpPanel` has no topic index — a topic is reachable only
through `topicForContext`, an explicit `openHelpTopic`, or a markdown link from another topic. So
`help/content/structure-designer.md` is unreachable while the flag is off purely because
**`home.md` does not link to it**. Do not add a link there until the screen ships.

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

`StructureOperation` is `never` today, so both stacks stay empty and the toolbar's Undo and Redo
buttons stay disabled. That is the honest state — nothing on this screen edits anything yet — and
the stacks are declared anyway because that is what makes the separation structural: `undo` and
`redo` here can only ever reach these stacks, whatever operation lands first.

**Do not copy `HISTORY_LIMIT`, `pushOperation` or the barrier machinery over speculatively.** Add
each with the first thing that needs it. (The root file's `hidden: Uint8Array` column — six
readers, never a writer — is the standing warning against reserving machinery early.)

## Geometry and constants

`constants.ts` holds everything the screen measures or paints with, so the canvas, the camera and
the layer control cannot disagree. Units are millimetres, one three.js unit to the millimetre,
matching the rest of the app.

The build plane is fixed at 1.5m square in a light grey-blue, chosen to be unmistakably not the
Designer's warm tan. Neither is editable — **this plane is deliberately not a DDObject**. It is
not selectable, not resizable, not recolourable and not listed anywhere, so it has none of the
properties a DDObject exists to provide. `ddObjects`/`rootId` stay exclusively the domino
designer's.

`DEFAULT_LAYER_HEIGHT_MM` is named `DEFAULT_` on purpose: layer heights become user-set, and
variable between layers, in a later release, at which point this becomes the height a new layer
starts at.

## The layer plane sits at z = 0 for layer 1, and that needs `polygonOffset`

Layer 1 is the *floor* of the first course, so its grey sheet lies exactly on the build plane.
Two surfaces at the same depth give the GPU the same number to compare, the depth test ties, and
which one survives comes down to draw order plus rounding that differs from pixel to pixel — the
shimmering mottle called z-fighting.

**`StructureBuildPlane`'s material carries `polygonOffset`, biasing it away from the camera.**
The alternative — nudging one plane a smidge in +Z — is the obvious fix and is wrong here: a fixed
nudge only separates the two while the camera looks straight down at them, and *this screen exists
to be tilted*. Tilt far enough and only the part of the nudge lying along the view direction still
separates them, which shrinks to nothing at a grazing angle. `polygonOffset` biases depth in the
depth buffer's own units with a slope-scaled term, so it holds at any angle. (Same fix, same
reason, as a domino's fill against its outline in the root file.)

**Applied always, not only at layer 1.** Nothing else in this scene lies in that plane, so at
every other layer the bias changes nothing visible, and a condition would only be one more thing
to get wrong.

`LayerPlane` is **semi-transparent rather than solid**, and that is not decoration: at layer 1 it
covers the build plane exactly, and a solid sheet would hide the colour that identifies this
screen, in the screen's own starting state. Letting the plane read through solves it with no
special case for layer 1. It is `depthWrite={false}` (a see-through surface must not record its
own depth) and `DoubleSide` (so it does not blink out at a near-horizontal tilt).

## The camera is Z-up, and that is load-bearing

`StructureCameraRig` sets `camera.up.set(0, 0, 1)` before the first `controls.update()`.

OrbitControls swings the camera around whichever axis the camera calls "up", and three.js defaults
that to **+Y**. This app's world is **Z-up**: the build plane lies in X/Y and structures grow into
+Z. Left at the default, dragging up and down rolls the scene sideways instead of tipping it away
from straight-down, and `maxPolarAngle` stops meaning what it reads as. If a vertical drag ever
starts tumbling the view, this is the line that went missing.

It is safe to set after construction because three-stdlib's `OrbitControls.update()` recomputes
its up-axis rotation from `object.up` on every call.

Starting exactly straight-down puts the camera at the pole of the orbit, which OrbitControls
handles with its own epsilon clamp; the resulting offset is far below a millimetre and invisible.

Other decisions in that file:

- **`resetView()` fits the plane *and* straightens the view**, and the two go together on purpose:
  once the view has been tilted there is no other control that straightens it, so the toolbar's
  fit button is the way back from a disorienting angle. Because both callers that compute a view
  — this and the first look at the screen — want straight-down, the fit maths never has to
  preserve an angle.
- **`savedView` carries the camera pose across a screen switch.** Each screen's `<Canvas>`
  unmounts with its screen, so without this a trip to another screen would throw away the user's
  rotation, which is real work to re-establish by hand. Written from the effect's cleanup, where
  the camera and controls are still live. The Designer deliberately still re-fits on return —
  changing that is a separate call.
- `EYE_DISTANCE_MM` does not affect how big anything looks (the camera is orthographic — that is
  the zoom). It decides how much room there is in front of and behind the scene, and it is the
  radius the camera swings on. Keep it well clear of the tallest stack of layers.

## Shift+Right-drag rotates; plain Right-drag pans

`StructureCanvas`'s `ShiftRotateGesture` does that with a **capture-phase** `pointerdown` listener
on the canvas element. Capture is what makes the ordering certain — a browser delivers an event
outermost-first on the way in (capture) before working back out (bubble), and OrbitControls
listens the ordinary way, so this always runs first.

**Deliberately not React state flipped by watching the Shift key**, which would re-render the
canvas every time Shift was pressed or released.

`StructureDesignerScreen`'s canvas area must keep its `onContextMenu` guard: right-dragging is the
pan gesture, so without it the browser's own menu opens on every pan.

## The layer control

`LayerSlider` is a line with a dot on it in a column of its own to the right of the canvas — the
idiom of a 3D-printer slicing program's layer scrubber. It is a column rather than an overlay so
it never covers the view and the canvas keeps its whole area for the tools this screen will grow.

- The dot's travel is inset by its own radius at each end (`.line`'s top/bottom in the CSS matches
  `DOT_RADIUS_PX`), so its centre can reach the first and last layer without overhanging the
  column. **Those two must stay in step** — nothing checks it, and the symptom is a dot that
  cannot quite reach an end.
- `setPointerCapture` on the track is what lets a drag that wanders out over the canvas keep
  working. Nothing else in this folder captures the pointer.
- It is a real `role="slider"` with the full `aria-value*` set and keyboard support (arrows, Page
  Up/Down, Home/End), because it is the only control on the screen and dragging a dot is not the
  only way people work.

## Adding to this screen

- New state goes in `store.ts`, not in a slice of the app store.
- New chrome gets its own component and its own CSS module in this folder — resist reaching for
  the Designer's.
- The first real editing tool is what turns `StructureOperation` from `never` into a union, adds
  cases to `undo`/`redo`, and enables the toolbar's buttons. It also fills the toolbar's empty
  left group and the sidebar's empty instruction list.
- When the JSON description lands, it is the boundary with the rest of the app. Keep it a plain
  data structure that the Designer can read without importing anything from this folder.