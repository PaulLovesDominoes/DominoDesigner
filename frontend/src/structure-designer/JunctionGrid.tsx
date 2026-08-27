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
 * The junction dots of the layer being worked on.
 *
 * A junction is somewhere a domino can be stood, and the dots are what a
 * placement drag snaps to.
 *
 * **The dots are drawn on one layer only, and they are that layer's own grid.**
 * Grid definitions stack across the layers the way layer definitions do, so a
 * layer higher up may well stand its dominoes on a different pattern; scrubbing
 * the slider is how that is seen. Drawing all hundred layers' dots at once would
 * be a hundred times the dots for a picture that would read as fog, so Show All
 * Layers deliberately does not multiply them.
 *
 * **Every junction is drawn, including one with a domino standing on it.** Such a
 * dot is not visible anyway — it sits half a millimetre off the layer's floor and
 * the domino on top of it is nearer the camera, so ordinary depth testing hides
 * it. Leaving those dots out by hand was tried and removed: it duplicated what
 * the graphics card was already doing, and it meant this component had to know
 * about the dominoes.
 *
 * That a junction is occupied is instead said where it matters — the placement
 * tool does not mark one under the pointer, and pressing on one starts nothing.
 * See DominoPlacementTool and useLayerJunctions.
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