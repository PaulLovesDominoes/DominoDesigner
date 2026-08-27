import type * as THREE from "three";

/**
 * Which way is up on the build plane, from where the user is looking.
 *
 * The arrow keys lay a domino from the junction under the pointer, and they have
 * to mean what they look like they mean. Pressing Up while looking straight down
 * should send the domino away from the user across the plane; tip the view until
 * a side of the plane is facing them and Up should send it up that side instead —
 * which is a different direction on the plane, and the same direction on screen.
 *
 * **All four are always exactly parallel to a side of the build plane.** They are
 * snapped rather than taken as they come, so a view turned a few degrees off
 * square still lays dominoes along the grid rather than at a slight angle to it.
 * Turning the view far enough is what makes what used to be Left become Up.
 */

/** The four arrow keys, named for what they do on screen. */
export type ArrowDirection = "up" | "down" | "left" | "right";

/** One direction on the build plane, as a unit vector in X and Y, in mm. */
export type PlaneDirection = readonly [number, number];

/** Which arrow a key press is, or undefined for any other key. */
export function arrowDirectionForKey(key: string): ArrowDirection | undefined {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return undefined;
  }
}

/**
 * What each arrow key points at on the build plane, for the view as it stands.
 *
 * Worked out from **the camera's own rightward direction**, not its up. With the
 * camera pinned to a Z-up world by StructureCameraRig, rightward is always flat
 * along the plane whatever the tilt, so it can be read off and snapped without
 * any special cases. The camera's up cannot: tipped almost to the horizon it is
 * pointing nearly straight up, and its shadow on the plane shrinks to almost
 * nothing — a direction still correct in principle and increasingly a matter of
 * rounding in practice.
 *
 * Screen-up is then rightward turned a quarter-turn anticlockwise. That holds
 * because the camera never gets underneath the build plane, so the plane is
 * always seen from above and a turn that looks anticlockwise on screen is one on
 * the plane as well — which is what lets the turn below be a plain swap of the
 * two coordinates with one of them negated.
 */
export function screenPlaneDirections(
  camera: THREE.Camera,
): Record<ArrowDirection, PlaneDirection> {
  // Column 0 of an object's world matrix is where its own rightward axis points
  // in the world.
  const rightX = camera.matrixWorld.elements[0];
  const rightY = camera.matrixWorld.elements[1];

  // Snapped to whichever side of the build plane it is nearest. A view turned
  // exactly forty-five degrees has to fall one way or the other; it falls to X,
  // which is arbitrary and needs to be nothing more.
  const right: PlaneDirection =
    Math.abs(rightX) >= Math.abs(rightY)
      ? [Math.sign(rightX) || 1, 0]
      : [0, Math.sign(rightY) || 1];

  // A quarter-turn anticlockwise of right.
  const up: PlaneDirection = [-right[1], right[0]];

  return {
    right,
    up,
    left: [-right[0], -right[1]],
    down: [-up[0], -up[1]],
  };
}