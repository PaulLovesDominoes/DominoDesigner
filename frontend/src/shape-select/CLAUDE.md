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