import { getOperationPreviewDrawsLayerSheets } from "./operation-types/registry";
import { useStructureStore } from "./store";

/**
 * Whether the operation whose properties are open draws layer sheets of its own,
 * and so stands in for the ordinary ones.
 *
 * Both things that draw layer sheets — the sheet at the layer being worked on,
 * and the Show All Layers view — have to step aside for such a preview, and must
 * *not* step aside for one that draws something else. Asking the question in one
 * place is what keeps the two from drifting apart.
 *
 * False when no dialog is open, which is the answer both callers want anyway.
 *
 * Safe as a plain store selector, unlike useLayerHeights and useJunctionPoints:
 * it hands back a true or a false, not a freshly built array, so there is nothing
 * for zustand to see as a change on every render.
 */
export function usePreviewDrawsLayerSheets(): boolean {
  return useStructureStore((s) => {
    if (!s.modifyingOperationId) return false;
    const operation = s.operations.find((o) => o.id === s.modifyingOperationId);
    return operation ? getOperationPreviewDrawsLayerSheets(operation.type) : false;
  });
}