import { DOMINO_SIZE } from "../../../dimensions";
import type { StructureOperationBase } from "../base";
import type { DominoGroupOperation } from "./object-model";

/**
 * Where a domino stands, which way up it is, and how a drag becomes one.
 *
 * Pure and free of React and of three.js, so the eventual JSON exporter can use
 * it as readily as the renderer and the placement tool do — the same discipline
 * layerDefinition/layers.ts and gridDefinition/junctions.ts follow, and for the
 * same reason.
 *
 * ## Attachment points
 *
 * A domino has 22 places it can be pinned to something. The four faces that are
 * one thickness wide carry three each — one at either end and one in the middle
 * — and the two broad faces carry five each: one at each corner and one in the
 * middle. Every one of them is inset half a thickness from the edges of the face
 * it sits on, so that two dominoes meeting at a point overlap by exactly one
 * thickness rather than fighting for the same space.
 *
 * **Only the downward-facing face takes part**, and this release uses only its
 * two end points. The middle point of every face is reserved for a later
 * release and is not worked out here at all.
 *
 * ## The local frame
 *
 * A domino being placed is described by its two active attachment points. Call
 * the near one `from` and the far one `to`, and build three directions from
 * them:
 *
 * - **u** — the unit vector pointing from `from` toward `to`, lying in the
 *   layer plane
 * - **v** — u turned a quarter-turn anticlockwise, so `(-uy, ux)`
 * - **w** — straight up, +Z
 *
 * Each orientation is then nothing more than the size of the domino's box along
 * those three directions, which is what DOMINO_ORIENTATIONS holds.
 */

/** Which way up a domino is placed. */
export type DominoOrientation = "upright" | "sideways" | "flat";

/**
 * What one of a domino's two attachment points is pinned to.
 *
 * "grid" means the point landed exactly on a junction of the structure's grid;
 * "free" means it fell somewhere in between. A later release, where a domino may
 * be attached to the attachment points of one on the layer below, adds a third
 * answer rather than a second flag — which is why this is a set of names and not
 * a true/false.
 */
export type DominoAnchorKind = "grid" | "free";

/**
 * One domino standing in a structure.
 *
 * **Both ends are stored, and no rotation angle is.** The angle is worked out
 * from the two points whenever it is wanted, and the distance between them is
 * always the orientation's attachment span — an invariant every reader can lean
 * on. Storing an angle instead would be just as accurate today, but two things
 * coming later make two points the right record:
 *
 * - **Dominoes will be attachable to the ones below them.** Error in a computed
 *   far end would then build up as the structure is climbed — a hundred times
 *   over, in a hundred-layer structure. Two points that are both real junction
 *   coordinates cannot accumulate anything.
 * - **A lower domino's attachment point and the grid point above it will
 *   compete** to be the same place. Recording that an end landed on the *grid*
 *   says without ambiguity which of the two was meant.
 *
 * `fromAnchor` is always "grid" in this release, since a placement always starts
 * at a junction. It is kept anyway: the symmetry between the two ends is the
 * whole point of the design, and this shape is the one written out as JSON. Do
 * not delete it for having only one possible value today.
 */
export interface PlacedDomino {
  orientation: DominoOrientation;
  /**
   * Which layer it stands on. Its height comes from layerFloorMm() at drawing
   * time rather than being stored, so editing a layer definition carries the
   * dominoes standing on those layers along with it.
   */
  layer: number;
  /** The near attachment point of the downward face, on the build plane, in mm. */
  from: readonly [number, number];
  /** The far attachment point. Always `attachSpanMm` away from `from`. */
  to: readonly [number, number];
  fromAnchor: DominoAnchorKind;
  toAnchor: DominoAnchorKind;
}

/**
 * The size of a domino's box along (u, v, w), for each way up it can be placed.
 *
 * Read the middle entry to see which face is downward: whichever pair of
 * dimensions is left over once the third has been given to **w**.
 *
 * - **upright** stands on an end — a thickness-by-width face — so it is as tall
 *   as a domino is long.
 * - **sideways** lies on a long narrow edge — thickness by length — so it is as
 *   tall as a domino is wide.
 * - **flat** lies on a broad face — width by length — so it is only as tall as a
 *   domino is thick.
 *
 * Everything else about a placed domino is worked out from these three numbers;
 * see `attachSpanMm` and `placedDominoPlacement`.
 */
export const DOMINO_ORIENTATIONS: Record<
  DominoOrientation,
  readonly [number, number, number]
> = {
  upright: [DOMINO_SIZE.width, DOMINO_SIZE.thickness, DOMINO_SIZE.length],
  sideways: [DOMINO_SIZE.length, DOMINO_SIZE.thickness, DOMINO_SIZE.width],
  flat: [DOMINO_SIZE.length, DOMINO_SIZE.width, DOMINO_SIZE.thickness],
};

/**
 * How far apart a domino's two active attachment points are.
 *
 * They sit at either end of the downward face, each inset half a thickness, so
 * the gap between them is the face's length less one whole thickness.
 *
 * **These are exactly the two spacing presets a grid can be built on** —
 * `lengthOverlap` and `widthOverlap` in gridDefinition/junctions.ts are the same
 * two subtractions. That is not a coincidence but the same fact stated twice: a
 * grid spaced this way is a grid a run of dominoes lands on junction by
 * junction, which is what lets both ends be recorded as "grid".
 */
export function attachSpanMm(orientation: DominoOrientation): number {
  return DOMINO_ORIENTATIONS[orientation][0] - DOMINO_SIZE.thickness;
}

/**
 * How close two distances have to be before they count as the same length.
 *
 * Used once, when a drag ends, to decide whether the far attachment point landed
 * on the junction the user dragged to. After that the answer is recorded on the
 * domino and nothing works it out again.
 *
 * **Sized against the error in a junction coordinate, and deliberately much
 * looser than gridDefinition/junctions.ts's CLIP_EPS_MM.** Junctions are
 * generated into a Float32Array, whose numbers carry about seven digits; a
 * coordinate out at the far side of a 1500mm plane is therefore good to roughly
 * a ten-thousandth of a millimetre, and a distance built from two of them to
 * about a thousandth. CLIP_EPS_MM is a thousand times tighter than that, which
 * is right for its own job of testing a coordinate against an edge and quite
 * wrong for this one: reused here it would let the on-grid answer come out
 * differently in different corners of the plane, which is the very failure its
 * own comment warns about.
 *
 * A thousandth of a millimetre is far below anything a builder can measure and
 * comfortably above the error being allowed for.
 */
export const SPAN_MATCH_EPS_MM = 1e-3;

/** Where a domino's box sits in the world, once its layer's floor is known. */
export interface DominoPlacement {
  /** The centre of the box, in world mm. */
  centre: readonly [number, number, number];
  /** How far the box is turned about the vertical axis, in radians. */
  angleRad: number;
  /** The box's size along (u, v, w) — see DOMINO_ORIENTATIONS. */
  extents: readonly [number, number, number];
}

/**
 * Where a placed domino's box actually is, given the height of the layer it
 * stands on.
 *
 * The centre is the near attachment point plus one step along each of the three
 * local directions. All three steps say the same thing — *the attachment points
 * are inset half a thickness from the edges of their face* — which is why one
 * expression covers all three orientations:
 *
 * - Along **u**, the two points are one span apart and the box is centred
 *   between them, so the step is half a span.
 * - Along **v**, the face's own width less one thickness, halved. That comes out
 *   zero for upright and sideways, whose downward face is only one thickness
 *   wide, so those two sit squarely on the line between the points. For flat it
 *   does not, so a flat domino lies mostly to one side of that line — which is
 *   what its two *corner* attachment points mean.
 * - Along **w**, half the height, lifting the box off the sheet it rests on.
 */
export function placedDominoPlacement(
  domino: PlacedDomino,
  floorZ: number,
): DominoPlacement {
  const extents = DOMINO_ORIENTATIONS[domino.orientation];
  const [extentU, extentV, extentW] = extents;

  const alongX = domino.to[0] - domino.from[0];
  const alongY = domino.to[1] - domino.from[1];
  const angleRad = Math.atan2(alongY, alongX);

  // u is the direction from one attachment point to the other; v is that turned
  // a quarter-turn anticlockwise.
  const uX = Math.cos(angleRad);
  const uY = Math.sin(angleRad);
  const vX = -uY;
  const vY = uX;

  const stepU = (extentU - DOMINO_SIZE.thickness) / 2;
  const stepV = (extentV - DOMINO_SIZE.thickness) / 2;

  return {
    centre: [
      domino.from[0] + uX * stepU + vX * stepV,
      domino.from[1] + uY * stepU + vY * stepV,
      floorZ + extentW / 2,
    ],
    angleRad,
    extents,
  };
}

/**
 * Turn a start junction and a point to face into the domino to store.
 *
 * The first point is where the near attachment point is pinned; the second only
 * says which way to face, because the domino keeps its own length however far
 * away it is. So the far attachment point is placed on the line between them,
 * one attachment span out.
 *
 * **Whether that far point is on the grid is told, not worked out**, which is why
 * this takes a flag its caller had better be sure of. `dominoFromDrag` below
 * measures the distance and answers it; the keyboard aims at a point it builds
 * exactly one span away, which measures as being on the grid and very often is
 * not.
 *
 * Returns undefined when the two points are the same point, which gives no
 * direction to face and is not a placement. The placement tool refuses to commit
 * in that case, so a click that never moved leaves nothing behind.
 */
export function dominoFromPoints(
  orientation: DominoOrientation,
  layer: number,
  jp1: readonly [number, number],
  jp2: readonly [number, number],
  jp2OnGrid: boolean,
): PlacedDomino | undefined {
  const towardX = jp2[0] - jp1[0];
  const towardY = jp2[1] - jp1[1];
  const reach = Math.hypot(towardX, towardY);
  if (reach === 0) return undefined;

  const span = attachSpanMm(orientation);

  return {
    orientation,
    layer,
    from: jp1,
    // Taken from the second point itself when that is where the far end lands,
    // rather than recomputed along the line, so the number stored is the
    // junction's own coordinate and not one a division and two multiplications
    // have been through.
    to: jp2OnGrid
      ? jp2
      : [jp1[0] + (towardX / reach) * span, jp1[1] + (towardY / reach) * span],
    fromAnchor: "grid",
    toAnchor: jp2OnGrid ? "grid" : "free",
  };
}

/**
 * Turn a finished drag between two junctions into the domino to store.
 *
 * When the two junctions happen to be exactly one span apart — which they are
 * for any run laid along a grid built on either overlap preset — the far
 * attachment point lands on the second junction, and both ends are recorded as
 * sitting on the grid. Otherwise the far end is recorded as free.
 *
 * That measurement is the whole of what this adds to dominoFromPoints, and it is
 * only sound because both points came off the grid to begin with.
 */
export function dominoFromDrag(
  orientation: DominoOrientation,
  layer: number,
  jp1: readonly [number, number],
  jp2: readonly [number, number],
): PlacedDomino | undefined {
  const reach = Math.hypot(jp2[0] - jp1[0], jp2[1] - jp1[1]);
  const onGrid = Math.abs(reach - attachSpanMm(orientation)) < SPAN_MATCH_EPS_MM;
  return dominoFromPoints(orientation, layer, jp1, jp2, onGrid);
}

/** Whether this operation is a domino group — the narrowing this file needs. */
function isDominoGroup(
  operation: StructureOperationBase,
): operation is DominoGroupOperation {
  return operation.type === "dominoGroup";
}

/**
 * The structure's domino group, or undefined when nothing has been placed yet.
 *
 * **There is only ever one.** Every domino placed goes into it, whatever layer
 * it stands on, and there is no way to make a second — so this is a lookup
 * rather than a rule about which of several wins. Every reader goes through it
 * anyway, so the day a release wants more than one group there is a single place
 * that has to change its mind.
 */
export function effectiveDominoGroup(
  operations: readonly StructureOperationBase[],
): DominoGroupOperation | undefined {
  return operations.find(isDominoGroup);
}