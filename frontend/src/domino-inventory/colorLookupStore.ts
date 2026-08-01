import { create } from "zustand";

import { useStore } from "../store";
import { hexToRgbBytes } from "../color";
import type { InventoryEntry } from "./object-model";

/**
 * A precomputed numericId -> [r,g,b] table, rebuilt once whenever the
 * inventory changes rather than resolved per-domino at draw time. This is
 * what lets dominoes/modeller.tsx turn a domino's colorId into pixels with a
 * single array index — no hex-parsing in that hot path — and is also what
 * makes editing or deleting an inventory color take effect everywhere it's
 * painted: the table changes reference, DominoModeller's subscription picks
 * that up, and a deleted color's dominoes fall back to
 * DEFAULT_DOMINO_COLOR automatically (a lookup miss), with no separate
 * pruning step needed.
 *
 * Built from *every* entry, not just active ones — toggling a color
 * inactive stops it being offered for new assignments (DominoColorPanel
 * filters that), but shouldn't retroactively grey out dominoes already
 * painted with it.
 */
interface ColorLookupStore {
  /** Sparse, indexed by InventoryEntry.numericId. */
  rgbById: ([number, number, number] | undefined)[];
}

export const useColorLookupStore = create<ColorLookupStore>(() => ({
  rgbById: [],
}));

function buildLookup(entries: InventoryEntry[]): ([number, number, number] | undefined)[] {
  const rgbById: ([number, number, number] | undefined)[] = [];
  for (const e of entries) rgbById[e.numericId] = hexToRgbBytes(e.color);
  return rgbById;
}

/**
 * Start keeping the lookup table in sync with the inventory. Call once at
 * startup, from main.tsx; returns zustand's unsubscribe. Explicit init
 * rather than a module-load side effect, mirroring dominoes/store.ts's
 * initDominoData and dominoes/selectionStore.ts's
 * initDominoSelectionPruning (same import-cycle rationale: this reads the
 * main store, so subscribing at module load could run before it's finished
 * constructing).
 */
export function initColorLookup() {
  useColorLookupStore.setState({ rgbById: buildLookup(useStore.getState().inventoryEntries) });
  return useStore.subscribe((state, prev) => {
    if (state.inventoryEntries !== prev.inventoryEntries) {
      useColorLookupStore.setState({ rgbById: buildLookup(state.inventoryEntries) });
    }
  });
}