import type { ThreeEvent } from "@react-three/fiber";

import {
  JUNCTION_DOT_LIFT_MM,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "./constants";

/**
 * What react-three-fiber actually puts on a pointer event's `target`.
 *
 * It is not the DOM element the event's own type says it is: r3f substitutes an
 * object of its own offering these two methods, which capture the pointer on the
 * canvas and keep routing its events to the mesh that asked. The event type it
 * inherits from the browser still describes the DOM's target, hence this.
 *
 * Both tools capture on this plane, which is why the cast lives beside it.
 */
interface PointerCaptureTarget {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
}

/**
 * The pointer-capture handle for an event on the pick plane.
 *
 * **Capture is what keeps a drag alive off the plane.** Without it a drag that
 * leaves the canvas never gets its release and whatever it was drawing hangs on
 * screen with the button already let go.
 *
 * What r3f sends once the pointer is off the plane is the intersection as it
 * stood when the button went down, so a drag wandering away from the plane
 * freezes the aim back where it started rather than reporting nonsense. That is
 * the right thing to happen, and it is worth knowing it comes from here rather
 * than from anything either tool does.
 */
export const captureTarget = (e: ThreeEvent<PointerEvent>) =>
  e.target as unknown as PointerCaptureTarget;

/**
 * The invisible surface a pointer on the canvas is measured against.
 *
 * Working out where the pointer is on the layer means raycasting: three.js takes
 * the pixel the pointer is over, works out the line from the camera through it,
 * and reports where that line meets a surface. So there has to be a surface, and
 * this is it.
 *
 * **It sits at exactly the height the junction dots are drawn at**, and getting
 * that wrong is subtle enough to be worth spelling out. If it were at the layer's
 * floor while the dots float half a millimetre above it, the point reported and
 * the dot the user is aiming at would be at different heights — and two things at
 * different heights only line up on screen when the view is straight down. Tilt
 * the view by an angle and they separate by the height difference times the
 * tangent of that angle; this camera tilts to within a fiftieth of a radian of
 * the horizon, where that tangent is about fifty. Half a millimetre becomes
 * twenty-five, which at the usual grid spacing is well over half the distance to
 * the next junction, so the wrong dot lights up. Matching the dots' own height
 * makes them the same point on screen at every tilt.
 *
 * **Both canvas tools use this one component**, and only ever one at a time —
 * they are mounted on the tool that is chosen, so two of these are never in the
 * scene together and cannot fight over a press. Shared rather than copied because
 * the height above is the kind of detail that gets fixed in one copy and not the
 * other.
 */
export default function LayerPickPlane({
  /** The floor of the layer being worked on, in mm above the build plane. */
  floorZ,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
}: {
  floorZ: number;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  return (
    // Transparent rather than `visible={false}`, which would take it out of
    // raycasting altogether and leave nothing to measure against at all.
    <mesh
      position={[
        STRUCTURE_PLANE_WIDTH_MM / 2,
        STRUCTURE_PLANE_HEIGHT_MM / 2,
        floorZ + JUNCTION_DOT_LIFT_MM,
      ]}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
    >
      <planeGeometry args={[STRUCTURE_PLANE_WIDTH_MM, STRUCTURE_PLANE_HEIGHT_MM]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}