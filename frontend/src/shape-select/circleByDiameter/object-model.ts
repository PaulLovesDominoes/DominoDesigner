import { CircleByDiameterSelectIcon } from "../../icons";
import { SELECTION_MARGIN_MM, type ShapePoint, type ShapeSelectDefinition } from "../base";
import CircleSelectPreview from "../circle/preview";
import type { CircleSelectState } from "../circle/object-model";

/**
 * Circle select, drawn across its diameter: one drag from one side of the
 * circle to the other, with both ends snapped to the grid.
 *
 * **This deliberately reuses the circle's own state, containment test and
 * preview** — `CircleSelectState` and `CircleSelectPreview` are imported
 * straight from `../circle/`, and only the gesture below is new. That bends the
 * one-folder-per-self-describing-variant rule on purpose: the two variants
 * describe the *same shape* and differ only in how the user draws it, so a
 * copied containment test would be a second definition of "circle" with nothing
 * to keep the two in step. This is the exception, not a pattern to spread — two
 * shapes that merely resemble each other should still each own their maths.
 *
 * **Why both variants exist**, since "another way to draw a circle" undersells
 * it. They snap different things, and neither guarantee subsumes the other:
 *
 *   - **By radius** snaps the *centre*, so the dominoes it takes are symmetric
 *     about that centre at every radius.
 *   - **By diameter** snaps *both ends*, so the circle spans exactly between two
 *     dominoes the user picked. Its centre is only derived, as their midpoint,
 *     and lands between snap points whenever the two ends are an odd number of
 *     half-pitches apart — so this one is not always symmetric.
 */

/**
 * The circle's own state plus the one number this variant needs on top of it.
 *
 * Adding a field rather than reusing CircleSelectState unchanged is what lets
 * `contains` apply SELECTION_MARGIN_MM without a square root per domino — the
 * radius has to be known, not just its square, and CircleSelectState stores
 * only a rim point. Because this has *more* fields than CircleSelectState and
 * not fewer, CircleSelectPreview still accepts it with no change.
 */
export interface CircleByDiameterSelectState extends CircleSelectState {
  /** (radius + SELECTION_MARGIN_MM)², worked out once per frame in fromEnds. */
  selectRadiusSquared: number;
}

/**
 * The circle with the given two ends of its diameter.
 *
 * CircleSelectState holds a centre and a point on the rim, which fits this
 * gesture with no new maths: the centre is the midpoint of the two ends, and
 * either end serves as the rim point, so the radius comes out as half the span
 * automatically.
 */
function fromEnds(start: ShapePoint, end: ShapePoint): CircleByDiameterSelectState {
  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  // The one square root in the whole variant, and it runs once per frame rather
  // than once per domino — which is the entire reason the result is stored.
  const selectRadius = Math.hypot(end.x - cx, end.y - cy) + SELECTION_MARGIN_MM;
  return {
    cx,
    cy,
    ex: end.x,
    ey: end.y,
    selectRadiusSquared: selectRadius * selectRadius,
  };
}

export const circleByDiameterSelectDefinition: ShapeSelectDefinition<CircleByDiameterSelectState> = {
  id: "circleByDiameter",
  label: "Circle select (by diameter)",
  icon: CircleByDiameterSelectIcon,

  nextStep(selectionGestureEvent, state, snapPoint) {
    // Both ends snap, exactly as the oval's do, and for the same reason the
    // oval documents: with both ends on the lattice the span between them is a
    // whole number of half-pitches, so a drag the user meant to be straight
    // across comes out exactly straight across rather than a degree or two off.
    // `origin` is held fixed at the sequence's first press by DominoEditor, so
    // it stays the near end however far the drag wanders.
    const snappedStart = snapPoint(selectionGestureEvent.origin);
    const snappedEnd = snapPoint(selectionGestureEvent.point);

    switch (selectionGestureEvent.kind) {
      case "press":
        // Claims the sequence immediately, as the by-radius circle does: while
        // this tool is armed every press is a circle, so a click that never
        // moves selects nothing and (without Ctrl) clears the selection.
        return { status: "active", state: fromEnds(snappedStart, snappedEnd) };
      case "move":
        if (!state) return { status: "ignore" };
        return { status: "active", state: fromEnds(snappedStart, snappedEnd) };
      case "release":
        if (!state) return { status: "ignore" };
        // One drag, finished on release — no closing click, unlike the oval and
        // the two polygons, because a circle has nothing left to ask for once
        // its diameter is known.
        return { status: "done", state: fromEnds(snappedStart, snappedEnd) };
    }
  },

  // Tested against the margined radius worked out in fromEnds, so this is the
  // one place the two circle variants genuinely differ in geometry rather than
  // only in gesture — see SELECTION_MARGIN_MM for why this one has a margin and
  // the by-radius circle does not.
  contains: (state, x, y) => {
    const dx = x - state.cx;
    const dy = y - state.cy;
    return dx * dx + dy * dy <= state.selectRadiusSquared;
  },

  // The two ends of the diameter — both snapped, so both land on real dominoes.
  // Deliberately not the centre, which this gesture only derives and which can
  // sit in the gap between two dominoes.
  controlPoints: (state) => ({
    selectionFixedCornerPoint: { x: 2 * state.cx - state.ex, y: 2 * state.cy - state.ey },
    selectionMovingCornerPoint: { x: state.ex, y: state.ey },
  }),

  hint: (state) =>
    state
      ? "Release to select every domino inside the circle. Esc to start over."
      : "Drag from one side of the circle to the other. Ctrl+drag adds to the selection, Alt+drag removes from it.",

  Preview: CircleSelectPreview,
};