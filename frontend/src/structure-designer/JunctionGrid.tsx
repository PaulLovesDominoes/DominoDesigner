import JunctionDots from "./JunctionDots";
// Reaching into one operation type's folder from the screen's own chrome, the
// same way LayerPlane does for layer heights and for the same reason: only grid
// definitions say where junctions go and only they ever will, so routing this
// back through the registry would be an abstraction with a single implementation
// dispatching to itself.
import { useJunctionPoints } from "./operation-types/gridDefinition/useJunctionPoints";
import { layerFloorMm } from "./operation-types/layerDefinition/layers";
import { useLayerHeights } from "./operation-types/layerDefinition/useLayerHeights";
import { useStructureStore } from "./store";

/**
 * The junction dots of the structure's grid, drawn on the layer being worked on.
 *
 * A junction is somewhere a domino can be stood, and the dots are what a
 * placement tool will eventually snap to. Snapping itself does not exist yet;
 * this draws them.
 *
 * **Every layer shares the same grid, but the dots are drawn on one layer only.**
 * That is not a contradiction — the grid is a fact about the whole structure, and
 * this is a picture of it where the work is happening. Drawing it on all hundred
 * layers at once would be a hundred times the dots for a picture that would read
 * as fog, so Show All Layers deliberately does not multiply them.
 *
 * **Nothing is drawn while an operation's properties are open.** That operation
 * has its own preview on screen then, and a grid definition's preview draws dots
 * at these very positions — two sets on top of each other would be pointless at
 * best and, while the grid is being changed, actively misleading. Same rule, and
 * the same reason, as LayerPlane's.
 */
export default function JunctionGrid() {
  const layer = useStructureStore((s) => s.layer);
  const modifying = useStructureStore((s) => s.modifyingOperationId !== null);
  const heights = useLayerHeights();
  const points = useJunctionPoints();

  if (modifying) return null;

  return <JunctionDots points={points} z={layerFloorMm(heights, layer)} />;
}