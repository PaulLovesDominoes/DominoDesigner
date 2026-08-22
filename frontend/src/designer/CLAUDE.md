# CLAUDE.md — the domino designer's editing modes

Guidance for `frontend/src/designer/`. The repo-root `CLAUDE.md` covers the app's shared
conventions — the store and its slices, the DDObject hierarchy, undo/redo, the clipboard, the
three.js boundary, and the placement and selection tools — and this file covers **domino editing
mode**: the modal state entered by double-clicking a domino-editable element, and the swatch panel
that is its primary control surface.

It is the hub that several folders are spokes of. Their own files carry the detail:
`shape-select/CLAUDE.md` and `paint-brush/CLAUDE.md` for the two families of gesture,
`image-map/CLAUDE.md` for a picture laid over the element, and `dominoes/CLAUDE.md` for the
per-domino data every one of them writes to.

## Domino editing mode

Double-click a domino-editable DDObject — on the canvas via `SelectionTool.tsx`'s `PickPlane`, or
its row in `DDObjectsPanel.tsx` — to enter. `enterDominoEditing` sets `dominoEditingId` and
switches `activeTool` to `"editDominoes"`, a `ToolId` with **no toolbar entry**; double-click is
the only way in. That one value is deliberately enough on its own to disarm
`SelectionTool`/`CreateByRegionTool`/`onPointerMissed` (none of them match `"select"` or
`"newElement"` any more) and to swap `Sidebar.tsx`'s child to `DominoColorPanel` — no scattered
`dominoEditingId` checks in those files. It also calls `cameraApi.frameDDObject(id)`, the one
imperative step and hence outside the `set`.

The mode is **fully modal**: the sidebar swaps, the toolbar's Select/New are *replaced* (not
disabled) through that same `activeTool` check, and only `ModeHintBar`'s Done (`exitDominoEditing`)
and Cancel (`cancelDominoEditing`, which discards — see *Undo/redo*) leave it. **Escape never
does**, though it clears a lot of in-mode state. Undo/redo stay enabled, clamped by the barrier
rather than disabled.

`designer/DominoEditingTools.tsx` is that replacement group, dropped into `Toolbar.tsx`'s left
`.group` the way `NewElementMenu` is, so `Toolbar.tsx` stays a layout file rather than growing a
branch per mode-specific button. It holds **Select All**, **Invert**, the **Expand** toggle, and
the image control (`image-map/ImageOverlayButton` — a button plus its own menu, since a picture is
no longer one thing to switch on and off); a separator; the selection-mode buttons (**Rectangle**
plus one per registered shape, `shape-select/CLAUDE.md`); another separator; then one
`DominoBrushButton` per registered brush (`paint-brush/CLAUDE.md`). Select All and Invert are raw
`<button>`s while the modes and Expand are `ToolButton`s: `ToolButton` always emits `aria-pressed`,
right for a toggle or a mode and wrong for a command.

While **colour mapping** is on, **everything in this group except Expand and the image control is
`disabled`** — disabled rather than hidden, unlike the Select/New swap, so the user can see what
the mode switched off and where it comes back. This is not about a picture being on screen: showing
one leaves every tool here working, which is the whole point of tracing over it.

**Both gesture groups grow as variants are registered**, which is why the fixed commands stay
pinned at the front. Rectangle stays first *within* its group because it is that group's null
state. Its `active` test is the one non-obvious thing here: it must test `dominoShapeSelectId ===
null && dominoBrushId === null && !imageMapActive && !imageTransformActive`. A null
`dominoShapeSelectId` means "no *shape* armed" and stopped meaning "a drag draws the rectangle
band" once a brush could own drags while leaving that field null; the two image sub-modes do the
same. Without the other tests, arming any of them lit Rectangle up too and two tools looked armed.

**Expand** (`dominoExpanded`) draws every domino oversized so tightly-spaced ones are easier to
hit. Four deliberate things:

- **How much to grow is the element type's decision**, via `dominoExpansion(ddObject)` — per *side*
  (`x0/x1/y0/y1/z0/z1`), so a type whose dominoes aren't centred in the room around them can grow
  into the space it actually has. `fieldElement` returns half its spacing on each side, making an
  expanded domino span exactly one pitch. Returning `undefined` means "nothing to grow into" and is
  *also* what disables the toolbar button — one member is deliberately both the amount and the
  capability flag, so a new type needs no second declaration.
- **`resolveDominoExpansion` is the single answer** both consumers read: `dominoes/modeller.tsx`,
  which draws the domino, and `designer/DominoEditor.tsx`, which hit-tests it. They *must* agree —
  if the render grows and the rect predicates don't, a rubber band visibly cuts through a domino
  without taking it, and a direct click (which raycasts the real drawn mesh) picks a domino a drag
  over the same spot misses. It returns a zeroed record rather than `null` so neither per-domino
  loop needs a branch, and it is **imperative on purpose**: it builds a fresh object, so using it as
  a `useStore` selector is the `useShallow` trap. Subscribe to
  `dominoExpanded`/`dominoEditingId`/`ddObjects[id]` and call it.
- **Growth is per-instance, never a geometry rebuild** — a scale in the fill's `instanceMatrix`
  plus a centre shift, and the vec3 `aScale` on the outline. Rebuilding either geometry would
  remount the `InstancedMesh` on every toggle. The centre shift is what makes asymmetric growth
  work at all, both geometries being centred on their origin; the same reasoning generalises the Z
  lift to `(length + z1 - z0) / 2`, without which an expanded domino sinks through the build plane.
- **It is view state, not document state**: no undo entry, and `exitDominoEditing` clears it. That
  is also why it is one of the two tools left enabled inside image mapping mode.

**The mode outline is measured off the dominoes, not the element's `bounds()`** —
`modeOutlineRect` puts it `MODE_OUTLINE_MARGIN` outside every domino's drawn footprint, expansion
included, so the gap stays constant whether Expand is on or off. Drawing it on `bounds()` (as it
originally was) both left it flush against the dominoes and let expanded ones overrun it. The trade
is that after a handle-drag the outline no longer coincides with the field's box, which is correct:
they are different rectangles (*The field's anchor model*). **`resolveDragToSelection` must keep
using `fieldBounds.x/y`**, not this rect, to convert world coordinates into the parent-relative
space `DominoData.positions` lives in — that origin is the element's `position`, and pointing it at
the outline would offset every rubber-band selection by the margin.

**Three colours carry meaning in the mode, and they are assigned as a set.** White means *dominoes
being taken into the selection* — a selected domino's outline, a region gesture that is adding, and
a paint brush's nib, which reads that same style rather than choosing its own. Dark means *being
given back*: an Alt gesture's `DESELECT_PREVIEW_STYLE`. A domino's *unselected* outline is a third,
darker grey, chosen to outline clearly while staying less intrusive than full black. The frame
round the edited DDObject was light grey and had to become white to be visible at all — an
unfortunate collision with the selection colour that cannot be helped. **Nothing here may be an
actual colour**: these must stay neutral so they don't bias the user's own colour choices.

`designer/DominoEditor.tsx` owns everything once inside the mode. (It was `DominoEditTool.tsx`; the
rename is worth keeping, since it has tools of its own and "the tools of the domino edit tool" had
become unreadable.) It owns per-domino selection — click, Ctrl+click, Alt+click, drag-rubberband,
Ctrl+drag, Alt+drag, arrows and Shift+arrows — stored in `dominoes/selectionStore.ts`'s
`DominoSelectionEntry` as `selected` plus `selectionFixedCornerIndex`/`selectionMovingCornerIndex`/
`baseSelection` for Shift+Arrow's Excel-style rectangle grow/shrink. **`recomputeFromRect` —
Shift+Arrow — is the only reader of either corner index in the app**; every other site merely
initialises them for a Shift+Arrow that may follow, which is why they are named for that role
rather than the generic `anchor`/`active`. A plain arrow doesn't read them either: it rescans the
selection for its extreme domino in the direction of travel, then resets both corners onto where it
landed. Delete hides the selection and Backspace clears it, both via `pickDominoSwatch`.

**Selection commands producing a whole set at once — select all, invert, and the swatch menus' four
modes — live in `dominoes/appStoreSlice.ts`, not here**, since a toolbar button and a menu item both
need them. They converge on one module-private `writeDominoSelection`, which is what guarantees they
all set both corners identically. **It finds the lowest index by iterating, never
`Math.min(...selected)`** — spreading a `Set` creates one argument per element and V8 exhausts the
call stack around 65k, so Select All on a 250×250 field crashed. That is why the helper exists at
all rather than the line being copied four times.

**Selecting dominoes never paints them.** It used to, while a swatch was *locked*; locking is gone,
and the only thing that paints without an explicit swatch click is a brush, only while its button
is down.

**Ctrl and Alt are one value, not two booleans.** `SelectionGestureMode` is `"replace" | "add" |
"remove"`, captured into `GestureSequenceState` at the sequence's first press. Four decisions:

- **It is read once and then fixed** — tapping Alt part-way through a drag changes nothing. That is
  what makes it unambiguous for a shape spanning several presses, and what keeps `sameIndices`
  correct: a mode that could flip mid-drag would invalidate that redraw guard, since the same
  covered indices would no longer imply the same result.
- **Alt is tested before Ctrl**, so both held gives `"remove"`. They ask for opposite things and the
  preview colour has to agree with whichever wins.
- **Alt+click removes exactly the domino under the cursor, and nothing else.** `onPointerUp`'s
  non-drag path has its own `"remove"` branch ahead of the other click branches, and it must stay
  separate rather than falling through: those branches would replace the whole selection with the
  single domino clicked, and an Alt+click on empty space would clear the selection outright. The
  shape path needs no equivalent — a click while a shape is armed is a zero-radius circle, and
  removing nothing changes nothing.
- **A remove does not change the two corners.** `nearestToPoint` picks from `indices`, which in a
  remove are exactly the dominoes that just *left*. It also sets `baseSelection` to the surviving
  set rather than `before.selected`, or the next Shift+Arrow would refill its rectangle from the
  pre-gesture selection and resurrect what was just removed. This is the part likeliest to be broken
  by a later "simplification".

**Two rectangle predicates live side by side and must not be merged.** A rubber-band drag uses
`touchedIndices` (footprint *intersects* the box, so a box the user can see cutting a row takes
that row); Shift+Arrow's `recomputeFromRect` uses `enclosedIndices` (full containment). Not a
preference: Shift+Arrow's rect comes from `rectFromIndices`, whose edges land flush on the two
corner dominoes' own boundaries, so an intersection test would let neighbours on the far side of a
tight pitch bleed in.

**A rubber-band drag previews live**, replacing the stored selection on every pointermove via
`resolveDragToSelection`, shared with the pointerup commit so the two can't disagree. Two
consequences are load-bearing:

- **`resolveDragToSelection` must stay a pure function of the gesture, never of the stored
  selection** — after the first frame the store holds this same drag's own preview, so Ctrl+drag's
  union builds on `GestureSequenceState.before`, captured at pointerdown. Holding that reference is
  sound only because every write path calls `replace` with a brand-new entry; nothing mutates one in
  place.
- **Escape mid-drag restores `before`** through `cancelSequence`. It covers shape gestures too,
  which preview identically.

**A band whose pointerup never arrived is finished by the next press, not thrown away.** Nothing in
this app captures the pointer, so a button released outside the canvas is never delivered and the
gesture is left open. `onPointerDown` therefore has a `live?.dragging` branch, ahead of the fresh
gesture it would otherwise build, that commits the band at the press point and clears the ref. Four
things make that right rather than a guess: `onPointerMove` is **not** gated on the button being
down, so the band has gone on tracking the pointer and the rectangle on screen at the press is one
the user can see; closing on the press rather than the release is the same idiom oval uses, and the
trailing pointerup is absorbed by `onPointerUp`'s existing `if (!g) return`; without it the press
was destructive, since the fresh gesture overwrote the band and its own pointerup fell into the
plain-click branches, clearing the whole selection on empty space; and Escape still backs out
through `cancelSequence`, so there are two ways to end a stranded band and neither surprises.

`onPointerLeave` is deliberately still brush-only and does nothing for a band — it has nothing to
rescue, the band having written its preview to the store on every frame.

`sameIndices` skips the store write when a frame swept nothing new; the modeller's redraw is
per-domino matrix/colour/attribute work, so that integer compare is orders cheaper than the frame
it elides. Domino hit-testing raycasts directly against the field's `InstancedMesh` via
`hitDominoIndex` rather than through R3F's synthetic pointer events, because that system only
considers objects with their own pointer-event props — and the mesh deliberately has none, so
`SelectionTool`'s DDObject-level pick planes underneath it keep receiving clicks.

## Domino color editing

While in domino editing mode, `Sidebar.tsx` shows `DominoColorPanel.tsx` — a grid of **swatches** —
instead of the object hierarchy. Everything here describes the panel outside image mapping; that
mode gives it two further states, dropping the specials and carets and either doing nothing or
picking a mapping palette (see `image-map/CLAUDE.md`'s *Which colours a run may use*).

**A swatch is anything the panel offers as a click target**, and the abstraction is the point:
`Hide` and `Unassigned` sit above one swatch per **active** inventory entry, and everything
downstream — the selected swatch, the apply, the menus, the highlight — is keyed by
`DominoSwatchId` so none of it branches on which kind it holds. Only three things distinguish the
specials: no hover tip, labels naming keys rather than typeable shortcuts, and `Unhide` in Hide's
menu. The split is store/presentation: `dominoes/swatches.ts` holds the ids,
`designer/dominoSwatches.ts` flattens all three kinds into one view model so the panel's JSX stays
a single code path, and `dominoes/appStoreSlice.ts` holds every behaviour keyed by id. `background`
is a free-form CSS value rather than a hex string so Hide's hatch and a solid colour share one
`style` prop.

**`pickDominoSwatch` is the single path for "the user picked this swatch"** — the panel's click,
the shortcut keys and Delete/Backspace all go through it, so they cannot drift. It does two things,
and the split is load-bearing:

- **It always records the swatch** in `dominoSelectedSwatchId`. There is deliberately no bare setter
  beside it, so no route can pick a colour while skipping the rest.
- **It applies the swatch to the selection**, dispatching to `hideSelectedDominoes`,
  `clearSelectedDominoColors` or `applyColorToSelectedDominoes`.

**It applies with a paint brush in hand too, and there is deliberately no guard against that.**
There briefly was one, back when a brush's hover footprint was written into the selection itself,
so a shortcut key pressed mid-drawing painted whatever the nib was over. The hover is its own set
now (`paint-brush/CLAUDE.md`), so this only ever sees a selection the user built — and the guard
would block precisely the thing it should allow: Ctrl+A then Backspace to clear a field you have
just painted, which is what the split was for.

One consequence that reads as a bug the first time: using a swatch click to *load* a brush while a
selection is standing also recolours that selection. That is what a swatch click does everywhere
else; Escape clears the selection first if that isn't wanted.

**Clicking Hide always hides, never toggles**, exactly as clicking Red always paints red — that is
what lets a brush use Hide as an eraser rather than flip-flopping as the nib passes over. Unhiding
is the menu's separate command, and painting a hidden domino unhides it for free.

**Those three are one line each over `applySwatchToSelection`**, which holds the guard prologue (in
the mode, something selected, dominoes exist) and the commit-then-push tail they had copied between
them. Underneath it, `swatchTargets` is the one place answering *what a swatch means as a colour
write* — Hide adds the flag to whatever colour the domino returns to, Unassigned is `0`, anything
else is the entry's `numericId`. It takes `data` only because Hide's answer is per-domino where the
other two are one value for every index. **A paint stroke shares `swatchTargets` but deliberately
not `applySwatchToSelection`**, needing the same resolution while pushing nothing per frame.

**Picking a swatch does two things at once**, and that is the whole interaction model: it applies
the swatch to the current selection, immediately, as one undoable `"dominoColors"` operation — and
it becomes `dominoSelectedSwatchId`, the colour a paint brush lays down, marked by the accent
outline. One gesture, both effects; there is nothing extra to do to load a brush. Three properties
follow, each of which a later change could plausibly reverse:

- **A click always selects, never deselects.** Clicking the already-selected swatch is a harmless
  re-apply; a toggle would make a brush go inert on a second click.
- **The selected swatch is cleared in exactly one place**, `exitDominoEditing` — not by Escape, and
  deliberately not by picking up a brush.
- **`Hide` and `Unassigned` are selectable like any other swatch**, which is the whole of "a brush
  can be an eraser". No branch anywhere implements that separately.

**The accent outline has exactly one meaning**, a deliberate narrowing. It was once also driven by
a derived `matchedSwatchId` ("the whole selection is this colour"), which could not share the
outline: a brush's "selection" was then the nib's hover footprint changing every frame, so a
derived highlight flickered while the colour the brush paints must stay put. The one remaining
override is `shortcutCandidates`, and the two hand off cleanly — while the buffer is part-typed the
candidates outline, and as it resolves the outline settles on the swatch the match just selected.

**It is drawn on `.swatchRow`, not `.swatch`** — the row being the swatch and its caret together.
On the swatch alone, `outline-offset` put the ring's right edge under the caret, which has a
background and painted over it, leaving the ring visibly open on one side. The row needs its own
`border-radius` for this, since an outline follows the radius of the element carrying it.

**A swatch shows pressed-in feedback, in every mode.** Without it, clicking a swatch whose colour
the selection already has produced no visible response at all, so the click read as ignored. **Two
selectors, one declaration** (`.swatch:active, .swatch.pressed`): `:active` is the mouse, while
`.pressed` is a brief flash driven from `dominoPressedSwatchId` for a swatch picked from the
*keyboard*, which has no `:active` of its own. Sharing the declaration keeps the two from drifting
apart visually. `DominoEditor`'s `pickSwatchFromKeyboard` is the only writer, clearing it on a
`SWATCH_PRESS_FLASH_MS` timer — and **`exitDominoEditing` must clear `dominoPressedSwatchId` too**,
which is not belt-and-braces: the keydown effect's teardown clears that timer, so leaving the mode
inside the flash window would strand a swatch looking held down for good.

**Two inset shadows, not one**, because a swatch is whatever colour the inventory holds: a
wide-spread tint darkens the whole face (what shows on a pale swatch) and a soft shadow cast inward
from the top edge gives the depth (what survives on a dark one). Deliberately neither `filter` nor
`transform` — either one between `#root` and `.sidebar` would break `FloatingTip`'s
`position: fixed`.

There are three ways in, and they behave identically because they are all one call to
`pickDominoSwatch`:

- **Click the swatch.**
- **Type its `shortcut`** — matches narrow live as you type, a unique match applies immediately, and
  Space applies the *exact* match when a longer one is also a valid prefix (disambiguating "B" from
  "B1"). The buffer (`dominoColorShortcut`) and its ~1.2s inactivity clear live in
  `DominoEditor.tsx`'s keyboard handler. **That handler returns early on any Ctrl/Cmd chord before
  reaching the shortcut branch**, so Ctrl+Z/Y, Ctrl+C/X/V and Ctrl+A all reach `DesignerScreen`'s
  handler instead of being swallowed as one-letter buffer entries. Keep that early return
  unconditional — every Ctrl chord is dispatched from that one place, which is why the clipboard and
  Ctrl+A needed no change here at all.
- **Delete hides, Backspace unassigns** — the `DEL`/`Bksp` labels on the two specials name exactly
  these keys, and both route through `pickDominoSwatch`, so they *are* ordinary swatch picks in
  every respect: same undo step, same `colorByCell` sync, same empty-selection no-op, and they
  become the selected swatch. The labels are *not* typeable; the buffer only matches inventory
  entries' own `shortcut`. **That uniformity is a deliberate reversal** — these two once skipped the
  selected-swatch half, on the reasoning that a Delete meant to clear one stray domino shouldn't
  turn the brush in your hand into an eraser. One rule beat one rule plus an exception, and the
  visible accent outline makes the change obvious and another click undoes it.

Clicking a swatch with **nothing selected** applies to nothing — a documented no-op — but it still
selects the swatch, which is the normal way to load a brush.

**Every swatch carries a caret opening `DominoSwatchMenu`** — Select / Add Select / Deselect /
Deselect others over the dominoes matching it, plus `Unhide` at the top for Hide alone. Four things:

- **Matching is plain equality on the stored `colorId`**, which is exactly why a colour swatch
  selects only *visible* dominoes of that colour and Hide selects exactly the hidden ones. There is
  no filter on top of the predicate and there must not be one.
- **Every item only ever changes which dominoes are selected**, never their colour — `Unhide`
  excepted, which is a command. That was not true while a colour could be locked, and it is the
  property the removal was for.
- **The separator belongs to `Unhide`** and renders inside the same `canUnhide` block, or a colour
  swatch's menu opens with a rule floating above `Select` and nothing above the rule.
- **The matching set is built in one pass and then combined**, rather than the modes mutating the
  previous selection inside the loop. `intersect` is why: it has to drop selected dominoes the loop
  never visits, which an in-loop `add`/`delete` cannot express.

The caret is a sibling of the swatch button, not a child — `.swatch` is itself a `<button>` and a
button cannot nest one. Each swatch's hover text is a `components/FloatingTip` rendered once at
panel level. It must not go back to being a CSS-only absolute tooltip: `Sidebar.tsx` sets
`overflow-y: auto`, which per spec makes `overflow-x` compute to `auto` as well, so the sidebar
clips on **both** axes and the tip is wider than the sidebar. `position: fixed` is the escape, and
it works only because nothing between `#root` and `.sidebar` sets
`transform`/`filter`/`will-change`/`contain` — don't add any.

Two further routes exist alongside these, neither belonging to the panel. **Pasting** a copied
pattern (Ctrl+V) belongs to the clipboard, and is the only route that can set many *different*
colours in one operation. **Painting freehand** belongs to `paint-brush/CLAUDE.md`, and is the only
one that writes continuously while recording a single undo entry.
