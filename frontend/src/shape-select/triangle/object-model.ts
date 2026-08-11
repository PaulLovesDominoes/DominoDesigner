import { TriangleSelectIcon } from "../../icons";
import { SELECTION_MARGIN_MM, type ShapePoint, type ShapeSelectDefinition } from "../base";
import TriangleSelectPreview from "./preview";

/**
 * Triangle select: a drag that lays down one side, then a separate click that
 * places the third corner.
 *
 * All three corners snap, for the reason the oval's two ends do: with the
 * corners on the lattice, the span between any two is a whole number of
 * half-pitches on each axis, so a side the user meant to be level comes out
 * exactly level instead of a degree or so off. An earlier version of this file
 * claimed a triangle had no orientation worth snapping to; using it showed
 * otherwise, and axis-aligned sides are common enough to matter.
 *
 * Which half of the gesture is running. "side" is the opening drag, laying down
 * the first two corners; "apex" is everything after the button comes up, when
 * the third corner is following the cursor.
 */
type TriangleGestureStage = "side" | "apex";

/**
 * A triangle in parent-relative mm: its three corners, plus one number worked
 * out from them so that the containment test below stays cheap.
 */
export interface TriangleSelectState {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  cx: number;
  cy: number;
  /**
   * Which way round the three corners are listed: +1 or -1, and 0 when they lie
   * in a straight line and the triangle has no area at all.
   *
   * Stored because `contains` runs once per domino per frame and needs to know
   * which side of each edge counts as "inside" — see there for how it is used.
   */
  windingSign: number;
  /**
   * How far outside each edge a domino's centre may sit and still count, in the
   * units `edgeCross` returns rather than in millimetres — see buildTriangleState
   * for why that conversion is done here instead of per domino.
   */
  edgeThresholdAB: number;
  edgeThresholdBC: number;
  edgeThresholdCA: number;
  stage: TriangleGestureStage;
}

/**
 * Twice the signed area of the triangle (px,py) (qx,qy) (rx,ry) — the 2D cross
 * product of the two edges leaving the first point.
 *
 * Only its sign is ever used here, and that sign says which side of the line
 * through p and q the point r lies on: positive on one side, negative on the
 * other, zero exactly on the line. That single fact does all the work in
 * `contains`.
 */
function edgeCross(
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number,
): number {
  return (qx - px) * (ry - py) - (qy - py) * (rx - px);
}

/**
 * Assembles a state, working out the winding and the three edge thresholds from
 * the corners.
 *
 * **The thresholds are how SELECTION_MARGIN_MM is applied without a division per
 * domino.** `edgeCross` does not return a distance — it returns the edge's
 * length multiplied by the distance. Turning that into millimetres would mean
 * dividing by the edge length once per domino per edge. Multiplying the other
 * way round instead costs three square roots here, once per frame, and leaves
 * `contains` as three plain comparisons: "at least this far outside" becomes
 * "at least this cross-product value".
 */
function buildTriangleState(
  a: ShapePoint,
  b: ShapePoint,
  c: ShapePoint,
  stage: TriangleGestureStage,
): TriangleSelectState {
  const threshold = (px: number, py: number, qx: number, qy: number) =>
    -SELECTION_MARGIN_MM * Math.hypot(qx - px, qy - py);
  return {
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    cx: c.x,
    cy: c.y,
    windingSign: Math.sign(edgeCross(a.x, a.y, b.x, b.y, c.x, c.y)),
    edgeThresholdAB: threshold(a.x, a.y, b.x, b.y),
    edgeThresholdBC: threshold(b.x, b.y, c.x, c.y),
    edgeThresholdCA: threshold(c.x, c.y, a.x, a.y),
    stage,
  };
}

export const triangleSelectDefinition: ShapeSelectDefinition<TriangleSelectState> = {
  id: "triangle",
  label: "Triangle select",
  icon: TriangleSelectIcon,

  nextStep(selectionGestureEvent, state, snapPoint) {
    // Every corner snaps, including the third — unlike the oval and the angled
    // rectangle, whose closing click sets only a size and so is left free. Here
    // the closing click places an actual corner, and a triangle with one level
    // side and two ragged ones would look worse than no snapping at all.
    const point = snapPoint(selectionGestureEvent.point);
    const origin = snapPoint(selectionGestureEvent.origin);

    switch (selectionGestureEvent.kind) {
      case "press": {
        if (state) {
          // Once the first side is fixed, a press is the closing click. During
          // the opening drag it means nothing.
          if (state.stage === "apex") return { status: "done", state };
          return { status: "active", state };
        }
        // Opens the triangle with all three corners on the same point, so there
        // is no area and nothing is selected yet. This press only arrives once
        // the pointer has travelled — DominoEditor holds it back until then,
        // so a press that never moves stays an ordinary click.
        return { status: "active", state: buildTriangleState(origin, origin, origin, "side") };
      }

      case "move": {
        if (!state) return { status: "ignore" };
        // Not gated on selectionGestureEvent.dragging: the shape previews from
        // the first pixel. In the "apex" stage these moves arrive with the
        // button UP, which is what lets the third corner follow the cursor
        // between the release and the closing click.
        if (state.stage === "side") {
          // Third corner stays on the second, so the triangle still has no area
          // and selects nothing — the opening drag is meant to show a bare line.
          // PolygonPreview draws that line on its own from the repeated corner,
          // so no stage handling is needed anywhere but here.
          return {
            status: "active",
            state: buildTriangleState({ x: state.ax, y: state.ay }, point, point, "side"),
          };
        }
        return {
          status: "active",
          state: buildTriangleState(
            { x: state.ax, y: state.ay },
            { x: state.bx, y: state.by },
            point,
            "apex",
          ),
        };
      }

      case "release": {
        if (!state) return { status: "ignore" };
        if (state.stage === "side") {
          // Fixes the first side and hands the third corner to the cursor. It
          // deliberately stays on the second corner for now: the cursor is
          // sitting there at this instant, and moving it is what gives the
          // triangle its area.
          return {
            status: "active",
            state: buildTriangleState(
              { x: state.ax, y: state.ay },
              { x: state.bx, y: state.by },
              { x: state.bx, y: state.by },
              "apex",
            ),
          };
        }
        // The release after the closing press. The sequence is already over by
        // then, so this is unreachable in practice — DominoEditor has cleared
        // its gesture ref. Handed back rather than committing twice.
        return { status: "active", state };
      }
    }
  },

  /**
   * Is the domino centred on (x, y) inside the triangle?
   *
   * A point is inside exactly when it is on the same side of all three edges.
   * `edgeCross` gives the side as a sign, and multiplying by the triangle's own
   * winding turns "the same side as the third corner" into simply "not
   * negative" — which is what lets one expression cover a triangle drawn either
   * way round, with no branch on direction.
   *
   * Each comparison is against that edge's threshold rather than against zero,
   * which is where SELECTION_MARGIN_MM comes in: a slightly negative value
   * still passes, so a domino sitting just outside an edge is taken. See
   * buildTriangleState for why the margin is carried in these units.
   */
  contains: (state, x, y) => {
    if (state.windingSign === 0) return false; // no area, so nothing is inside
    const winding = state.windingSign;
    return (
      winding * edgeCross(state.ax, state.ay, state.bx, state.by, x, y) >=
        state.edgeThresholdAB &&
      winding * edgeCross(state.bx, state.by, state.cx, state.cy, x, y) >=
        state.edgeThresholdBC &&
      winding * edgeCross(state.cx, state.cy, state.ax, state.ay, x, y) >=
        state.edgeThresholdCA
    );
  },

  // The first corner pressed, and the last one placed.
  controlPoints: (state) => ({
    selectionFixedCornerPoint: { x: state.ax, y: state.ay },
    selectionMovingCornerPoint: { x: state.cx, y: state.cy },
  }),

  hint: (state) => {
    if (!state) {
      return "Click-drag to draw one side of the triangle. Ctrl+drag adds to the selection, Alt+drag removes from it.";
    }
    return state.stage === "side"
      ? "Release to fix that side of the triangle. Esc to start over."
      : "Move to place the third corner, then click to select. Esc to start over.";
  },

  Preview: TriangleSelectPreview,
};