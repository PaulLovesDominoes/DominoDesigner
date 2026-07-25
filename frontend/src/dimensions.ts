/**
 * Physical dimensions of the domain's real-world objects, in millimetres.
 * All rendering geometry should source its sizes from here.
 */

/**
 * A single domino. Dominoes are set up **standing**, so `length` runs vertically
 * (three.js +Z) and the piece occupies a `width` x `thickness` footprint on the
 * build plane — i.e. it reads as 24 x 7.5 when viewed from above.
 *
 * Which horizontal axis takes `width` vs `thickness` depends on the domino's
 * orientation within its field, so those are named semantically rather than as
 * X/Y.
 */
export const DOMINO_SIZE = {
  /** vertical extent when standing (three.js Z) */
  length: 48,
  /** the broad face's horizontal extent */
  width: 24,
  /** the thin horizontal extent */
  thickness: 7.5,
};

/**
 * A generic position type, typically for handling XY positions on the build plane
 */
export interface Position {
  x: number,
  y: number
};

