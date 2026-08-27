import type { ThreeEvent } from "@react-three/fiber";

import {
  dominoUnderRay,
  type DominoBox,
} from "./operation-types/dominoGroup/overlap";

/**
 * Which placed domino a pointer event landed on, as a position in the group's
 * own list, or -1 for none.
 *
 * **The dominoes carry no pointer handlers of their own, and must not be given
 * any.** Two reasons, and both matter:
 *
 * - They are drawn as one instanced mesh of many thousands of copies.
 *   react-three-fiber would have to build a hit record per copy on every pointer
 *   event to answer which one was under the pointer, which is not a thing to do
 *   tens of thousands of times a second.
 * - A mesh with no handlers does not stop a ray passing through it. That is what
 *   lets the pointer reach the invisible plane underneath, which is where both
 *   canvas tools measure the pointer against the layer. Handlers on the dominoes
 *   would put a wall in front of it.
 *
 * So instead the tools ask this. The event already carries the ray the renderer
 * worked out, and useDominoBoxes already holds every domino as a solid, so the
 * answer is one walk through a list — the same list the drawn dominoes are built
 * from, which is what guarantees that what is clicked is what is seen.
 */
export function dominoUnderPointer(
  boxes: readonly DominoBox[],
  event: ThreeEvent<PointerEvent>,
): number {
  const { origin, direction } = event.ray;
  return dominoUnderRay(boxes, {
    origin: [origin.x, origin.y, origin.z],
    direction: [direction.x, direction.y, direction.z],
  });
}