import { placedDominoPlacement, type PlacedDomino } from "./dominoes";

/**
 * A placed domino as a solid in space, and the questions that get asked of one.
 *
 * Pure and free of React and of three.js, like dominoes.ts next door, so the
 * eventual JSON exporter and a future collision check outside the canvas can
 * both use it.
 *
 * ## Dominoes may not occupy the same space
 *
 * That is a physical rule and it is enforced exactly, against the domino's real
 * box. It has one consequence worth stating up front, because it looks like a
 * bug the first time it is met:
 *
 * **Two dominoes cannot be laid end to end at neighbouring junctions of either
 * overlap grid.** A domino is 48mm long but its attachment points are 40.5mm
 * apart, each inset half a thickness from the ends, so at that spacing the two
 * boxes really do run 7.5mm into each other. That is also true of the real
 * things: a course of dominoes always has gaps in it, and what closes a gap is a
 * *bridging* domino on the layer above, resting on the two either side of it.
 * The overlap spacings exist for that relationship between layers, not for a run
 * along one. Structures are built to be knocked down, and those small overlaps
 * between courses are exactly what makes a stack stand up and still topple when
 * it is pushed.
 *
 * So do not "fix" the rule to tolerate a thickness of penetration. It would make
 * end-to-end runs legal and with them a whole class of structures that cannot be
 * built.
 *
 * ## Touching is not overlapping
 *
 * A domino resting on top of another shares a plane with it, and two standing
 * side by side on a grid spaced to their own width share a face. Every test here
 * therefore asks for real penetration, deeper than OVERLAP_EPS_MM, rather than
 * for any contact at all.
 */

/**
 * A placed domino's box in the world: an upright rectangular block, free to be
 * turned about the vertical axis but never tipped, which is what lets every test
 * below split into a flat rectangle in X/Y and a plain range of heights.
 */
export interface DominoBox {
  /** The centre of the footprint, on the build plane, in mm. */
  centreX: number;
  centreY: number;
  /**
   * The unit vector along u — the direction from one attachment point to the
   * other. The other footprint axis, v, is this turned a quarter-turn
   * anticlockwise, and is worked out where it is needed rather than stored.
   */
  uX: number;
  uY: number;
  /** Half the footprint's size along u and along v. */
  halfU: number;
  halfV: number;
  /** The heights the box spans: its floor and its top, in mm above the plane. */
  z0: number;
  z1: number;
}

/**
 * How far two boxes have to run into each other before it counts.
 *
 * Sized the same way SPAN_MATCH_EPS_MM in dominoes.ts is, and for the same
 * reason: junction coordinates come out of a Float32Array, so a distance built
 * from two of them carries about a thousandth of a millimetre of error. Below
 * that, two dominoes that were meant to touch exactly would sometimes read as
 * overlapping and sometimes not, depending on where on the plane they were.
 */
export const OVERLAP_EPS_MM = 1e-3;

/** An axis-aligned rectangle on the build plane, in mm. */
export interface PlaneRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A line from a point out into the scene, in world mm. Both parts are x, y, z. */
export interface PickRay {
  origin: readonly [number, number, number];
  /** Unit length, as three.js hands it over. */
  direction: readonly [number, number, number];
}

/** Where a placed domino's box is, once the height of its layer's floor is known. */
export function dominoBox(domino: PlacedDomino, floorZ: number): DominoBox {
  const { centre, angleRad, extents } = placedDominoPlacement(domino, floorZ);
  return {
    centreX: centre[0],
    centreY: centre[1],
    uX: Math.cos(angleRad),
    uY: Math.sin(angleRad),
    halfU: extents[0] / 2,
    halfV: extents[1] / 2,
    z0: floorZ,
    z1: floorZ + extents[2],
  };
}

/** How far the box reaches along one direction, measured from its own centre. */
const radiusAlong = (box: DominoBox, axisX: number, axisY: number) =>
  Math.abs(box.uX * axisX + box.uY * axisY) * box.halfU +
  // v is u turned a quarter-turn anticlockwise.
  Math.abs(-box.uY * axisX + box.uX * axisY) * box.halfV;

/**
 * The smallest square-on rectangle the footprint fits inside.
 *
 * A first cut, not an answer: a domino lying at an angle fills rather less of
 * this than a domino square to the plane does. It is what a space index sorts
 * dominoes into, so that the exact tests above are only asked about the handful
 * that could plausibly be involved.
 */
export function boxFootprintBounds(box: DominoBox): PlaneRect {
  const reachX = radiusAlong(box, 1, 0);
  const reachY = radiusAlong(box, 0, 1);
  return {
    minX: box.centreX - reachX,
    minY: box.centreY - reachY,
    maxX: box.centreX + reachX,
    maxY: box.centreY + reachY,
  };
}

/**
 * Whether two dominoes run into each other — not merely touch. See the note on
 * OVERLAP_EPS_MM.
 *
 * The heights are compared first, because that is two subtractions and it settles
 * most pairs on its own — including the case this whole check exists for, an
 * upright domino 48mm tall standing on a 24mm layer and reaching two courses up
 * into whatever is built above it. Nothing here knows about layers at all: a box
 * carries its own floor and its own top, so a domino on layer 3 and one on layer
 * 5 are compared by exactly the same two numbers as two on one layer.
 *
 * The footprints are then compared by looking for a **separating axis** — a
 * direction along which the two rectangles' shadows do not meet. If there is one
 * they cannot be touching, and if there is not they must be. Only four directions
 * have to be tried, each rectangle's own two, which is what makes this exact
 * rather than an approximation: any gap between two rectangles is a gap along one
 * of their four edge directions.
 */
export function boxesOverlap(a: DominoBox, b: DominoBox): boolean {
  if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= OVERLAP_EPS_MM) return false;

  const betweenX = b.centreX - a.centreX;
  const betweenY = b.centreY - a.centreY;

  // Each box's u and its v. Written out rather than looped so the quarter-turn
  // is visible at the one place it happens.
  const axes: readonly [number, number][] = [
    [a.uX, a.uY],
    [-a.uY, a.uX],
    [b.uX, b.uY],
    [-b.uY, b.uX],
  ];

  for (const [axisX, axisY] of axes) {
    const apart = Math.abs(betweenX * axisX + betweenY * axisY);
    const reach = radiusAlong(a, axisX, axisY) + radiusAlong(b, axisX, axisY);
    if (apart >= reach - OVERLAP_EPS_MM) return false;
  }
  return true;
}

/**
 * Whether a point on the build plane is inside a domino's footprint.
 *
 * What hides a junction: something is already standing on that spot, so nothing
 * can be started there. A point exactly on the edge of a footprint is left alone,
 * for the reason every other test here does the same.
 */
export function pointInBoxFootprint(
  box: DominoBox,
  x: number,
  y: number,
): boolean {
  const fromCentreX = x - box.centreX;
  const fromCentreY = y - box.centreY;
  const alongU = fromCentreX * box.uX + fromCentreY * box.uY;
  const alongV = -fromCentreX * box.uY + fromCentreY * box.uX;
  return (
    Math.abs(alongU) < box.halfU - OVERLAP_EPS_MM &&
    Math.abs(alongV) < box.halfV - OVERLAP_EPS_MM
  );
}

/**
 * Whether a domino's footprint meets a rectangle drawn on the build plane at all.
 *
 * The rubber band's test, and deliberately a *touching* one rather than a
 * containing one: a box the user can see cutting across a row of dominoes is
 * expected to take that row. The Designer's own rubber band makes the same call.
 *
 * The same separating-axis argument as boxesOverlap, over the rectangle's two
 * axes (which are simply X and Y) and the domino's two. No epsilon: a band is
 * dragged by hand and there is no exact case to protect.
 */
export function boxFootprintTouchesRect(
  box: DominoBox,
  rect: PlaneRect,
): boolean {
  const rectHalfX = (rect.maxX - rect.minX) / 2;
  const rectHalfY = (rect.maxY - rect.minY) / 2;
  const betweenX = (rect.minX + rect.maxX) / 2 - box.centreX;
  const betweenY = (rect.minY + rect.maxY) / 2 - box.centreY;

  // Along X and along Y, where the rectangle's own reach is just its half size.
  if (Math.abs(betweenX) > radiusAlong(box, 1, 0) + rectHalfX) return false;
  if (Math.abs(betweenY) > radiusAlong(box, 0, 1) + rectHalfY) return false;

  // Along the domino's own u and v, where the rectangle's reach has to be worked
  // out the same way a turned box's is.
  const axes: readonly [number, number][] = [
    [box.uX, box.uY],
    [-box.uY, box.uX],
  ];
  for (const [axisX, axisY] of axes) {
    const apart = Math.abs(betweenX * axisX + betweenY * axisY);
    const reach =
      radiusAlong(box, axisX, axisY) +
      Math.abs(axisX) * rectHalfX +
      Math.abs(axisY) * rectHalfY;
    if (apart > reach) return false;
  }
  return true;
}

/**
 * How far along the ray the box is first met, or undefined if the ray misses it.
 *
 * This is how a click picks a domino. The dominoes are drawn as one instanced
 * mesh of many thousands of copies and carry no pointer handlers of their own —
 * which is deliberate, since a handler on them would both cost a hit record per
 * copy and stop the pointer reaching the invisible plane the placement gesture is
 * measured against. So the tools ask this instead, over the boxes they already
 * hold.
 *
 * The ray is turned into the box's own frame first — along u, along v, and
 * straight up — which makes the box square-on and the test the standard one for
 * a square-on box: work out where the ray enters and leaves each of the three
 * pairs of parallel faces, and the box is hit if there is a stretch of the ray
 * inside all three at once.
 *
 * A ray starting inside the box gives 0, so a click on a domino the camera is
 * within still picks it.
 */
export function rayBoxDistance(
  box: DominoBox,
  ray: PickRay,
): number | undefined {
  const fromCentreX = ray.origin[0] - box.centreX;
  const fromCentreY = ray.origin[1] - box.centreY;
  const fromCentreZ = ray.origin[2] - (box.z0 + box.z1) / 2;

  const starts = [
    fromCentreX * box.uX + fromCentreY * box.uY,
    -fromCentreX * box.uY + fromCentreY * box.uX,
    fromCentreZ,
  ];
  const steps = [
    ray.direction[0] * box.uX + ray.direction[1] * box.uY,
    -ray.direction[0] * box.uY + ray.direction[1] * box.uX,
    ray.direction[2],
  ];
  const halves = [box.halfU, box.halfV, (box.z1 - box.z0) / 2];

  let entering = 0;
  let leaving = Infinity;

  for (let axis = 0; axis < 3; axis++) {
    const step = steps[axis];
    const start = starts[axis];
    const half = halves[axis];

    // Running parallel to this pair of faces: either always between them or
    // never, and no distance along the ray changes that.
    if (Math.abs(step) < 1e-12) {
      if (Math.abs(start) > half) return undefined;
      continue;
    }

    const toNear = (-half - start) / step;
    const toFar = (half - start) / step;
    entering = Math.max(entering, Math.min(toNear, toFar));
    leaving = Math.min(leaving, Math.max(toNear, toFar));
    if (entering > leaving) return undefined;
  }

  return entering;
}

/**
 * Which domino the pointer is over, as an index into `boxes`, or -1 for none.
 *
 * The nearest one along the ray, so a domino standing in front of another takes
 * the click. A plain walk through the list: a click happens once, and even tens
 * of thousands of these are a fraction of a frame.
 */
export function dominoUnderRay(
  boxes: readonly DominoBox[],
  ray: PickRay,
): number {
  let nearest = -1;
  let nearestDistance = Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const distance = rayBoxDistance(boxes[i], ray);
    if (distance !== undefined && distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
  }
  return nearest;
}