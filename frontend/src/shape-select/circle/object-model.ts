import { CircleSelectIcon } from "../../icons";
import type { ShapeSelectDefinition } from "../base";
import CircleSelectPreview from "./preview";

/**
 * A circle drag in parent-relative mm: the centre the drag started from, and
 * the perimeter point the cursor is at.
 *
 * Two points rather than a centre and a radius so the hot path never takes a
 * square root — the radius only ever exists squared, which is the form
 * `contains` wants and the only form it needs. The preview takes the one sqrt
 * it needs for its scale, once per frame rather than once per domino.
 */
export interface CircleSelectState {
  cx: number;
  cy: number;
  ex: number;
  ey: number;
}

export function radiusSquared(s: CircleSelectState): number {
  const dx = s.ex - s.cx;
  const dy = s.ey - s.cy;
  return dx * dx + dy * dy;
}

export const circleSelectDefinition: ShapeSelectDefinition<CircleSelectState> = {
  id: "circle",
  // Both circle variants name their gesture, since neither is "the" circle —
  // this label is the button's tooltip and aria-label, and so the only place a
  // user learns which of the two they are pointing at.
  label: "Circle select (by radius)",
  // A ring with a radius drawn out from its centre — the gesture itself, which
  // says more than Remixicon's RiFocusLine did before it. See
  // icons/CircleSelectIcon.
  icon: CircleSelectIcon,

  nextStep(event, state, snapPoint) {
    switch (event.kind) {
      case "press": {
        // Opens the circle at zero radius. This press only arrives once the
        // pointer has already travelled: DominoEditor holds a shape back
        // until then, so a press that never moves stays an ordinary click and
        // selects the domino under it. Single-domino click and Ctrl+click both
        // work with this armed.
        //
        // The centre snaps and the rim (below) never does. That is the whole
        // fix for a lopsided circle: a centre left wherever the cursor landed
        // sits at a different phase relative to the domino lattice on each
        // side, so the boundary cuts a different count left and right. Put the
        // centre on a lattice point and the midpoints are symmetric about it,
        // which makes the counts match at *any* radius — while the radius
        // itself stays continuous.
        const c = snapPoint(event.origin);
        return { status: "active", state: { cx: c.x, cy: c.y, ex: c.x, ey: c.y } };
      }
      case "move":
        // Not gated on event.dragging: the circle previews from the first pixel.
        if (!state) return { status: "ignore" };
        return { status: "active", state: { ...state, ex: event.point.x, ey: event.point.y } };
      case "release":
        if (!state) return { status: "ignore" };
        return { status: "done", state: { ...state, ex: event.point.x, ey: event.point.y } };
    }
  },

  // Squared on both sides — no sqrt in a loop that runs once per domino per
  // frame. `<=` takes a domino sitting exactly on the rim, the same inclusive
  // edge the rectangle band's rect test uses.
  contains: (s, x, y) => {
    const dx = x - s.cx;
    const dy = y - s.cy;
    return dx * dx + dy * dy <= radiusSquared(s);
  },

  // Centre and rim: the direct analogue of the rectangle band's press and
  // release corners, so a following Shift+Arrow extends from where the drag
  // ended rather than from wherever the shape happens to be widest.
  controlPoints: (s) => ({
    selectionFixedCornerPoint: { x: s.cx, y: s.cy },
    selectionMovingCornerPoint: { x: s.ex, y: s.ey },
  }),

  hint: (s) =>
    s
      ? "Release to select every domino inside the circle. Esc to start over."
      : "Drag from the center of the circle out to its edge. Ctrl+drag adds to the selection, Alt+drag removes from it.",

  Preview: CircleSelectPreview,
};