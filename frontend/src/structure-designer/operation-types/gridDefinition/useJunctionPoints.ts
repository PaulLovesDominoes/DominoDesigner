import { useMemo } from "react";

import { useStructureStore } from "../../store";
import { generateJunctionPoints, gridForLayer } from "./junctions";

/**
 * The junctions of the grid on the layer being worked on.
 *
 * There is always one: a layer no grid definition reaches gets DEFAULT_GRID, so
 * the screen opens with somewhere to stand a domino rather than with bare plane.
 * See gridForLayer.
 *
 * **This must never be written as a store selector**, and neither must
 * `generateJunctionPoints` itself. A selector's job is to hand back the same
 * thing when nothing has changed, and these build a fresh array every call — so
 * zustand would see a change on every render, re-render, see another change, and
 * loop until React gives up with "Maximum update depth exceeded". In a canvas
 * component that takes the WebGL context down with it.
 *
 * `useShallow` does not rescue it either, the way it does for a selector
 * returning a small fresh object: the array here is thousands of entries long
 * and would be compared entry by entry on every render.
 *
 * What works is subscribing to `operations` — a stored reference that changes
 * exactly when the document does — and to the plain number `layer`, and working
 * the points out in a useMemo hanging off both. Same shape, and same reasoning,
 * as useLayerHeights.
 *
 * Note the dots are now rebuilt when the layer changes, which they were not when
 * every layer shared one grid. Two layers running on the same definition still
 * produce the same points, and rebuilding them is a few milliseconds against a
 * scrub of the layer slider; caching per definition would be machinery in front
 * of a cost nobody can see.
 */
export function useJunctionPoints(): Float32Array {
  const operations = useStructureStore((s) => s.operations);
  const layer = useStructureStore((s) => s.layer);
  return useMemo(
    () => generateJunctionPoints(gridForLayer(operations, layer)),
    [operations, layer],
  );
}