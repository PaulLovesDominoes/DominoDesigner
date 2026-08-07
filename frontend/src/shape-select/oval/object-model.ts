import { OvalSelectIcon } from "../../icons";
import { SELECTION_MARGIN_MM, type ShapePoint, type ShapeSelectDefinition } from "../base";
import OvalSelectPreview from "./preview";

/**
 * Oval select: a drag from one end of the oval to the other, setting its length
 * and angle, then a separate click that sets its width.
 *
 * This is the first shape whose gesture spans more than one press, so it is
 * also the worked example of what ShapeSelectStepResult's "active" status is
 * for. Circle finishes on its release; this one keeps the sequence open through
 * the release and closes on the *next* press.
 *
 * Which half of the gesture is running. "major" is the opening drag between the
 * oval's two ends, setting how long it is and which way it points; "minor" is
 * everything after the button comes up, when only the width is still being
 * chosen.
 */
type OvalGestureStage = "major" | "minor";

/**
 * How wide the oval is drawn during the opening drag, before the user has said
 * anything about width — half as wide as it is long, so it reads as an oval
 * rather than a circle. The final click replaces it.
 */
const PREVIEW_WIDTH_RATIO = 0.5;

/**
 * An oval in parent-relative mm, stored as the maths a containment test wants
 * rather than as the raw points the gesture produced.
 *
 * The reason is that `contains` runs once per domino per frame — 62,500 times
 * on a 250x250 field — so anything that can be worked out once per frame is
 * worked out here instead. That is what the unit axis and the two inverses are
 * for: with them, `contains` is multiplications only, no square roots, no
 * divisions and no trigonometry.
 *
 * Every field is derived by buildOvalState, so they cannot fall out of step
 * with each other.
 */
export interface OvalSelectState {
  /**
   * Centre — the midpoint of the oval's two ends, not a point the user pressed.
   * It therefore *moves* during the opening drag, as the far end is dragged
   * around while the near end stays put.
   *
   * Note it is not itself snapped, and cannot be: the grid's snap points sit
   * half a pitch apart, so two snapped ends are a whole number of half-pitches
   * apart and their midpoint lands on a snap point only when that number is
   * even. The other half of the time it falls midway between two, somewhere no
   * single press could have produced. So an oval is not always symmetric about
   * the domino centres the way a snapped circle always is.
   *
   * That is a price worth paying, because what snapping both ends actually buys
   * is an **exact angle**. With both ends on the lattice, the span between them
   * is a whole number of half-pitches on each axis, so a drag the user meant to
   * be horizontal lands on exactly horizontal and one meant to be vertical on
   * exactly vertical. Before it, axis-aligned ovals always came out slightly
   * canted and looked wrong — which is the problem this solved. Landing the ends
   * on chosen dominoes is a second, smaller benefit; centre symmetry is the one
   * thing given up.
   */
  centerX: number;
  centerY: number;
  /**
   * Half the oval's length — half the distance between its two ends, since the
   * opening drag runs the full length rather than out from the middle.
   */
  semiMajor: number;
  /** Half its width, measured at right angles to that. */
  semiMinor: number;
  /**
   * The opening drag's direction as a unit vector — a vector exactly 1 long, so
   * it carries the angle without carrying any length. Naming them cos/sin
   * because that is what they equal: the cosine and sine of the oval's rotation.
   */
  axisCos: number;
  axisSin: number;
  /**
   * 1/semiMajor and 1/semiMinor, with SELECTION_MARGIN_MM already added to each
   * half-axis first. See the note above on why these are stored, and
   * SELECTION_MARGIN_MM on why the test runs a hair wider than the oval drawn.
   */
  invSemiMajor: number;
  invSemiMinor: number;
  stage: OvalGestureStage;
}

/**
 * Assembles a state with every derived field filled in. The only place an
 * OvalSelectState is ever built, so the inverses always match the lengths they
 * invert.
 *
 * A zero-length axis gets an inverse of 0 rather than Infinity, which keeps the
 * arithmetic in `contains` finite; `contains` guards on the lengths themselves
 * so that 0 is never mistaken for a real answer.
 */
function buildOvalState(
  centerX: number,
  centerY: number,
  axisCos: number,
  axisSin: number,
  semiMajor: number,
  semiMinor: number,
  stage: OvalGestureStage,
): OvalSelectState {
  return {
    centerX,
    centerY,
    axisCos,
    axisSin,
    semiMajor,
    semiMinor,
    // The margin goes in here and nowhere else, which is what keeps semiMajor
    // and semiMinor themselves exact for the preview and the control points.
    // `contains` then picks it up without knowing it exists.
    invSemiMajor: semiMajor > 0 ? 1 / (semiMajor + SELECTION_MARGIN_MM) : 0,
    invSemiMinor: semiMinor > 0 ? 1 / (semiMinor + SELECTION_MARGIN_MM) : 0,
    stage,
  };
}

/**
 * The oval implied by its two ends — the point the drag started from and the
 * one it has reached, both already snapped to the grid.
 *
 * The opening drag runs the oval's full length, end to end, rather than out
 * from its middle. So the centre is the midpoint of the two ends and *moves*
 * as the far end is dragged around, while the near end stays where it was
 * pressed. The half-length is half the distance between them.
 */
function withEndsFrom(
  state: OvalSelectState,
  snappedStart: ShapePoint,
  snappedEnd: ShapePoint,
): OvalSelectState {
  const spanX = snappedEnd.x - snappedStart.x;
  const spanY = snappedEnd.y - snappedStart.y;
  const length = Math.hypot(spanX, spanY);
  const semiMajor = length / 2;
  // With the two ends on the same point there is no direction to read, so the
  // previous one is kept. Otherwise the oval would flick back to horizontal
  // every time a drag passed back over where it started.
  const axisCos = length > 0 ? spanX / length : state.axisCos;
  const axisSin = length > 0 ? spanY / length : state.axisSin;
  return buildOvalState(
    (snappedStart.x + snappedEnd.x) / 2,
    (snappedStart.y + snappedEnd.y) / 2,
    axisCos,
    axisSin,
    semiMajor,
    // PREVIEW_WIDTH_RATIO deliberately did not change when the drag became a
    // full length rather than a half one. It multiplies semiMajor, and the
    // oval's proportions depend only on semiMinor / semiMajor — so halving what
    // a drag of a given length means to semiMajor leaves the drawn shape
    // exactly as it was.
    semiMajor * PREVIEW_WIDTH_RATIO,
    "major",
  );
}

/**
 * The oval the final click implies, once the length and angle are locked: only
 * how far the cursor sits *sideways* from the oval's long axis counts.
 *
 * (-axisSin, axisCos) is the axis direction turned a quarter turn, so the dot
 * product below is the sideways distance. Sliding the cursor along the length
 * therefore changes nothing at all, which is what makes this click read as
 * "just the width".
 */
function withWidthFrom(
  state: OvalSelectState,
  pointX: number,
  pointY: number,
): OvalSelectState {
  const offsetX = pointX - state.centerX;
  const offsetY = pointY - state.centerY;
  const sideways = Math.abs(-offsetX * state.axisSin + offsetY * state.axisCos);
  return buildOvalState(
    state.centerX,
    state.centerY,
    state.axisCos,
    state.axisSin,
    state.semiMajor,
    sideways,
    "minor",
  );
}

export const ovalSelectDefinition: ShapeSelectDefinition<OvalSelectState> = {
  id: "oval",
  label: "Oval select",
  // Hand-drawn: Remixicon ships no oval or ellipse glyph, and the nearest thing
  // it has (a medicine capsule) said the wrong thing. See icons/OvalSelectIcon.
  icon: OvalSelectIcon,

  nextStep(selectionGestureEvent, state, snapPoint) {
    const { x, y } = selectionGestureEvent.point;

    // Both ends of the opening drag snap. `origin` is the sequence's first
    // press, held fixed by DominoEditTool for the whole sequence, so it stays
    // the near end however far the drag wanders. Snapping both is what makes an
    // oval span exactly from one chosen domino to another.
    //
    // The closing width click is deliberately NOT snapped — see the "minor"
    // branches below, which use the raw point.
    const snappedEnds = (): [ShapePoint, ShapePoint] => [
      snapPoint(selectionGestureEvent.origin),
      snapPoint(selectionGestureEvent.point),
    ];

    switch (selectionGestureEvent.kind) {
      case "press": {
        if (state) {
          // A press with a sequence already open. Once the length and angle are
          // fixed this is the closing click; during the opening drag it means
          // nothing, so the state is handed back untouched.
          if (state.stage === "minor") {
            return { status: "done", state: withWidthFrom(state, x, y) };
          }
          return { status: "active", state };
        }
        // Claims the sequence on the first press, exactly as circle does, so a
        // single-domino click is unavailable while this tool is armed. Both
        // ends are the same point here, giving an oval of no length yet.
        const [start, end] = snappedEnds();
        return {
          status: "active",
          state: withEndsFrom(
            buildOvalState(start.x, start.y, 1, 0, 0, 0, "major"),
            start,
            end,
          ),
        };
      }

      case "move": {
        if (!state) return { status: "ignore" };
        // Not gated on selectionGestureEvent.dragging: the oval previews from
        // the first pixel. In the "minor" stage these moves arrive with the
        // button UP, which is what lets the width follow the cursor between the
        // release and the closing click.
        if (state.stage === "minor") {
          return { status: "active", state: withWidthFrom(state, x, y) };
        }
        const [start, end] = snappedEnds();
        return { status: "active", state: withEndsFrom(state, start, end) };
      }

      case "release": {
        if (!state) return { status: "ignore" };
        if (state.stage === "major") {
          // Locks the length and angle in and moves to the width stage, but
          // deliberately does NOT read a width from this point: the cursor is
          // sitting on the far end, which is on the long axis, so its sideways
          // distance is zero and the oval would collapse to a flat line the
          // instant the button came up. It keeps the placeholder width until
          // the cursor actually moves off the axis.
          const [start, end] = snappedEnds();
          return {
            status: "active",
            state: { ...withEndsFrom(state, start, end), stage: "minor" },
          };
        }
        // The release that follows the closing press. The sequence is already
        // finished by then, so this is unreachable in practice — DominoEditTool
        // has cleared its gesture ref. Handed back unchanged rather than
        // committing a second time.
        return { status: "active", state };
      }
    }
  },

  /**
   * Is the domino centred on (x, y) inside the oval? The offset from the centre
   * is measured along the oval's own two axes, then each is divided by that
   * axis's half-length; a point is inside when those two scaled distances
   * satisfy u² + v² <= 1, which is the circle test written in the oval's own
   * stretched frame.
   */
  contains: (state, x, y) => {
    // An axis of zero length has no inside. This has to test the lengths rather
    // than the inverses: buildOvalState stores an inverse of 0 for a zero axis,
    // which would drive that term to 0 and wrongly report every domino in the
    // field as inside.
    if (state.semiMajor <= 0 || state.semiMinor <= 0) return false;
    const offsetX = x - state.centerX;
    const offsetY = y - state.centerY;
    const alongLength = offsetX * state.axisCos + offsetY * state.axisSin;
    const alongWidth = -offsetX * state.axisSin + offsetY * state.axisCos;
    const u = alongLength * state.invSemiMajor;
    const v = alongWidth * state.invSemiMinor;
    // <= takes a domino sitting exactly on the rim, the same inclusive edge
    // circle and the rectangle band both use.
    return u * u + v * v <= 1;
  },

  // The oval's two ends: the one pressed first, then the one released on. Both
  // are places the user aimed at directly, and both are snapped, so each lands
  // on a real domino.
  //
  // Deliberately not the centre, which the ends-based gesture only derives — it
  // can land midway between two snap points and so sit in the gap between
  // dominoes, which is a poor place to start a Shift+Arrow from. The width end
  // is not used either: it is a size the user adjusted, not a place they aimed.
  controlPoints: (state) => ({
    selectionFixedCornerPoint: {
      x: state.centerX - state.axisCos * state.semiMajor,
      y: state.centerY - state.axisSin * state.semiMajor,
    },
    selectionMovingCornerPoint: {
      x: state.centerX + state.axisCos * state.semiMajor,
      y: state.centerY + state.axisSin * state.semiMajor,
    },
  }),

  hint: (state) => {
    if (!state) {
      return "Drag from one end of the oval to the other to set its length and angle. Ctrl+drag adds to the selection, Alt+drag removes from it.";
    }
    return state.stage === "major"
      ? "Release at the far end to fix the oval's length and angle. Esc to start over."
      : "Move to set the oval's width, then click to select. Esc to start over.";
  },

  Preview: OvalSelectPreview,
};