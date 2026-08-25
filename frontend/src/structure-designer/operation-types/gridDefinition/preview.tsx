import { useMemo } from "react";

import JunctionDots from "../../JunctionDots";
import type { StructureOperationPreviewProps } from "../base";
import { generateJunctionPoints } from "./junctions";
import { layerFloorMm, layerHeights } from "../layerDefinition/layers";
import type { GridDefinitionOperation } from "./object-model";

/**
 * The junction dots shown while a grid definition's properties are open, on the
 * layer being worked on.
 *
 * Unlike a layer definition's preview this does not stand in for anything — the
 * grey layer sheet stays exactly where it is underneath, which is what the
 * definition's `previewDrawsLayerSheets` being absent arranges. The dots would
 * be floating over nothing without it.
 *
 * The dots move as the properties are typed, and none of that needs an explicit
 * repaint request even though the canvas only redraws on demand. This component
 * lives inside the <Canvas>, so a store write re-renders it, react-three-fiber
 * applies the change to the scene, and the renderer paints. The one thing to
 * keep: work the points out *here*, inside the canvas. Computing them outside and
 * handing the answer in through something React does not track is how this would
 * quietly stop repainting.
 */
export default function GridDefinitionPreview({
  operation,
  operations,
  layer,
}: StructureOperationPreviewProps<GridDefinitionOperation>) {
  // Rebuilt only when the grid itself changes, not when the layer is scrubbed —
  // the dots are lifted to the layer's height rather than regenerated at it.
  const points = useMemo(() => generateJunctionPoints(operation), [operation]);
  const z = layerFloorMm(layerHeights(operations), layer);

  return <JunctionDots points={points} z={z} />;
}