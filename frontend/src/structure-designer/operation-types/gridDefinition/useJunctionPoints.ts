import { useMemo } from "react";

import { useStructureStore } from "../../store";
import { effectiveGrid, generateJunctionPoints } from "./junctions";

/**
 * The junctions of the grid the structure has.
 *
 * There is always one: with no grid definition in the list this is DEFAULT_GRID,
 * so the screen opens with somewhere to stand a domino rather than with bare
 * plane. See effectiveGrid.
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
 * exactly when the document does — and working the points out in a useMemo
 * hanging off it. Same shape, and same reasoning, as useLayerHeights.
 */
export function useJunctionPoints(): Float32Array {
  const operations = useStructureStore((s) => s.operations);
  return useMemo(() => generateJunctionPoints(effectiveGrid(operations)), [operations]);
}