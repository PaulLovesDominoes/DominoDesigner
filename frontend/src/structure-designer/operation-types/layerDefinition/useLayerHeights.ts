import { useMemo } from "react";

import { useStructureStore } from "../../store";
import { layerHeights } from "./layers";

/**
 * The height of every layer in the structure, recomputed only when the list of
 * operations actually changes.
 *
 * **`layerHeights` must never be used as a store selector.** It builds a fresh
 * array every call, and zustand decides whether a component needs re-rendering
 * by comparing what the selector returned last time — a new array is never
 * equal to the old one, so every render would look like a change and the
 * component would loop for ever ("Maximum update depth exceeded"). Inside a
 * component drawing into the canvas that takes the WebGL context down with it.
 *
 * `useShallow` is the usual answer to that and does **not** help here: it
 * compares one level deep, and the thing that is new each time is the array
 * itself. The fix is to subscribe to `operations` — a value the store holds on
 * to, so it only changes when the document does — and work the heights out from
 * it with useMemo, which is what this hook is.
 *
 * Kept out of layers.ts so that file stays free of React and can be used by the
 * eventual JSON exporter.
 */
export function useLayerHeights(): number[] {
  const operations = useStructureStore((s) => s.operations);
  return useMemo(() => layerHeights(operations), [operations]);
}