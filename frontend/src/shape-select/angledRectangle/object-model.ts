import { AngledRectangleSelectIcon } from "../../icons";
import { SELECTION_MARGIN_MM, type ShapePoint, type ShapeSelectDefinition } from "../base";
import AngledRectangleSelectPreview from "./preview";

/**
 * Angled rectangle select: a drag that lays down one side — giving both its
 * length and the rectangle's angle — then a separate click that sets the corner
 * opposite where the drag started.
 *
 * Distinct from the rectangle rubber band, which is always square to the screen
 * and is the mode's default gesture rather than a registered shape. This one
 * can sit at any angle.
 *
 * **Both ends of the opening drag snap**, for the reason the oval's do: with
 * both on the lattice, the span between them is a whole number of half-pitches
 * on each axis, so a side the user meant to be level comes out exactly level
 * rather than a degree or so off. The closing click does not snap — it only
 * sizes the rectangle, and pinning a size to the grid would fight the point of
 * being able to draw one at any angle.
 *
 * Which half of the gesture is running. "side" is the opening drag; "width" is
 * everything after the button comes up, when the far corner is following the
 * cursor.
 */
type AngledRectangleGestureStage = "side" | "width";

/**
 * An angled rectangle in parent-relative mm, stored as the corner the drag
 * started from, the direction it went, and how far the rectangle reaches in
 * each of those two directions.
 */
export interface AngledRectangleSelectState {
  /** The corner the drag started from. Snapped, and fixed for the whole gesture. */
  ax: number;
  ay: number;
  /** The direction of the drawn side, as a vector exactly 1 long. */
  axisCos: number;
  axisSin: number;
  /**
   * How far the rectangle runs along that direction, **signed**, so the closing
   * click can pull the far end back past the starting corner and the rectangle
   * simply reaches the other way.
   */
  length: number;
  /**
   * How far it reaches out from the drawn side, **signed**.
   *
   * The side the user drew is an *edge* of the rectangle, not a line through
   * its middle, so the rectangle has to appear on whichever side of that line
   * the cursor is on. Keeping the sign here is what makes it flip across as the
   * cursor crosses the line; an absolute distance would need a separate flag
   * saying which way, and the two could then disagree.
   */
  width: number;
  /**
   * The two extents again as plain ranges, with SELECTION_MARGIN_MM already
   * added at both ends and the signs above already resolved. Storing them this
   * way is what keeps `contains` to two comparisons with no branch on which way
   * either extent runs.
   */
  alongMin: number;
  alongMax: number;
  acrossMin: number;
  acrossMax: number;
  stage: AngledRectangleGestureStage;
}

/** Assembles a state, resolving the two signed extents into margined ranges. */
function buildRectangleState(
  ax: number,
  ay: number,
  axisCos: number,
  axisSin: number,
  length: number,
  width: number,
  stage: AngledRectangleGestureStage,
): AngledRectangleSelectState {
  return {
    ax,
    ay,
    axisCos,
    axisSin,
    length,
    width,
    alongMin: Math.min(0, length) - SELECTION_MARGIN_MM,
    alongMax: Math.max(0, length) + SELECTION_MARGIN_MM,
    acrossMin: Math.min(0, width) - SELECTION_MARGIN_MM,
    acrossMax: Math.max(0, width) + SELECTION_MARGIN_MM,
    stage,
  };
}

/**
 * The rectangle's four corners, going round its edge: the starting corner, the
 * far end of the drawn side, then those two moved out by the width.
 *
 * The direction across the rectangle is the direction along it turned a quarter
 * turn, which for a vector (cos, sin) is (-sin, cos). Exported so the preview
 * and the control points below both read one definition rather than each
 * working the corners out again.
 */
export function rectangleCorners(state: AngledRectangleSelectState): ShapePoint[] {
  const alongX = state.axisCos * state.length;
  const alongY = state.axisSin * state.length;
  const acrossX = -state.axisSin * state.width;
  const acrossY = state.axisCos * state.width;
  return [
    { x: state.ax, y: state.ay },
    { x: state.ax + alongX, y: state.ay + alongY },
    { x: state.ax + alongX + acrossX, y: state.ay + alongY + acrossY },
    { x: state.ax + acrossX, y: state.ay + acrossY },
  ];
}

/**
 * The state the opening drag implies, from its two snapped ends. The starting
 * corner is the snapped press, so it moves only if snapping moves it — never
 * once the drag is under way.
 */
function withSideFrom(
  state: AngledRectangleSelectState,
  snappedStart: ShapePoint,
  snappedEnd: ShapePoint,
): AngledRectangleSelectState {
  const spanX = snappedEnd.x - snappedStart.x;
  const spanY = snappedEnd.y - snappedStart.y;
  const length = Math.hypot(spanX, spanY);
  // With the two ends on the same point there is no direction to read, so the
  // previous one is kept — otherwise the rectangle would flick back to
  // horizontal whenever a drag passed back over where it started.
  return buildRectangleState(
    snappedStart.x,
    snappedStart.y,
    length > 0 ? spanX / length : state.axisCos,
    length > 0 ? spanY / length : state.axisSin,
    length,
    0,
    "side",
  );
}

/**
 * The state the closing click implies: the cursor becomes the corner opposite
 * the one the drag started from, setting **both** how long the rectangle is and
 * how wide.
 *
 * The starting corner never moves, so the rectangle grows and shrinks from that
 * end only — deliberately not symmetrically about the middle of the drawn side.
 * Measuring along the axis and out from it gives the two extents directly, and
 * both keep their sign, so pulling the cursor back past the starting corner
 * reaches the other way just as crossing the line flips the width.
 */
function withCornerFrom(
  state: AngledRectangleSelectState,
  point: ShapePoint,
): AngledRectangleSelectState {
  const offsetX = point.x - state.ax;
  const offsetY = point.y - state.ay;
  return buildRectangleState(
    state.ax,
    state.ay,
    state.axisCos,
    state.axisSin,
    offsetX * state.axisCos + offsetY * state.axisSin,
    -offsetX * state.axisSin + offsetY * state.axisCos,
    "width",
  );
}

export const angledRectangleSelectDefinition: ShapeSelectDefinition<AngledRectangleSelectState> = {
  id: "angledRectangle",
  label: "Angled rectangle select",
  icon: AngledRectangleSelectIcon,

  nextStep(selectionGestureEvent, state, snapPoint) {
    // Snapped and unsnapped are both needed, so neither is applied up front:
    // the opening drag's two ends snap, the closing click does not.
    const rawPoint = selectionGestureEvent.point;

    switch (selectionGestureEvent.kind) {
      case "press": {
        if (state) {
          // Once the side is fixed, a press is the closing click. During the
          // opening drag it means nothing.
          if (state.stage === "width") return { status: "done", state };
          return { status: "active", state };
        }
        // Opens the rectangle with no length and no width. This press only
        // arrives once the pointer has travelled — DominoEditor holds it back
        // until then, so a press that never moves stays an ordinary click.
        const snappedOrigin = snapPoint(selectionGestureEvent.origin);
        return {
          status: "active",
          state: buildRectangleState(snappedOrigin.x, snappedOrigin.y, 1, 0, 0, 0, "side"),
        };
      }

      case "move": {
        if (!state) return { status: "ignore" };
        // In the "width" stage these moves arrive with the button UP, which is
        // what lets the far corner follow the cursor between the release and
        // the closing click.
        if (state.stage === "side") {
          return {
            status: "active",
            state: withSideFrom(
              state,
              snapPoint(selectionGestureEvent.origin),
              snapPoint(rawPoint),
            ),
          };
        }
        return { status: "active", state: withCornerFrom(state, rawPoint) };
      }

      case "release": {
        if (!state) return { status: "ignore" };
        if (state.stage === "side") {
          // Hands the far corner to the cursor, but deliberately reads nothing
          // from this point: the cursor is sitting on the far end of the drawn
          // side right now, so the width would be zero anyway and the length
          // unchanged. Switching the stage alone says that plainly, and keeps
          // the rectangle a bare line until the cursor actually moves off it.
          return { status: "active", state: { ...state, stage: "width" } };
        }
        // The release after the closing press; the sequence is already over.
        return { status: "active", state };
      }
    }
  },

  /**
   * Is the domino centred on (x, y) inside the rectangle? The offset from the
   * starting corner is measured along the drawn side and out from it, and both
   * have to fall inside the ranges worked out in buildRectangleState — which
   * already carry the margin and the direction each extent runs.
   *
   * A rectangle with no width is therefore a strip a millimetre either side of
   * the drawn line, which is why the opening drag takes the occasional domino
   * whose centre it passes through. That is accepted rather than special-cased:
   * the line is meant to select nothing much, not exactly nothing.
   */
  contains: (state, x, y) => {
    const offsetX = x - state.ax;
    const offsetY = y - state.ay;
    const along = offsetX * state.axisCos + offsetY * state.axisSin;
    if (along < state.alongMin || along > state.alongMax) return false;
    const across = -offsetX * state.axisSin + offsetY * state.axisCos;
    return across >= state.acrossMin && across <= state.acrossMax;
  },

  // The corner pressed first, and the one diagonally opposite it — which is
  // exactly where the closing click landed. The same two opposite corners the
  // rectangle rubber band seeds from.
  controlPoints: (state) => {
    const corners = rectangleCorners(state);
    return {
      selectionFixedCornerPoint: corners[0],
      selectionMovingCornerPoint: corners[2],
    };
  },

  hint: (state) => {
    if (!state) {
      return "Drag out one side of the rectangle to set its start and angle. Ctrl+drag adds to the selection, Alt+drag removes from it.";
    }
    return state.stage === "side"
      ? "Release to fix that side of the rectangle. Esc to start over."
      : "Move to set the opposite corner, then click to select. Esc to start over.";
  },

  Preview: AngledRectangleSelectPreview,
};