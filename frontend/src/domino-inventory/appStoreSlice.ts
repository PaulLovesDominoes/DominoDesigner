import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import {
  createSeedInventory,
  modeDefault,
  nextInventoryNumberFor,
  MATERIAL_OPTIONS,
  FINISH_OPTIONS,
  BRAND_OPTIONS,
  NEW_ENTRY_COLOR,
  type InventoryEntry,
  type InventoryEntryId,
  type InventorySortColumn,
} from "./object-model";

/**
 * The Domino Inventory screen's slice of the app store (store.ts's AppState),
 * as opposed to a store of its own: `applyColorToSelectedDominoes` resolves a
 * swatch to a numericId by reading `inventoryEntries` directly off the same
 * state, and colorLookupStore.ts subscribes to it there. Splitting it out into
 * a separate store would turn both of those into cross-store reads for no gain
 * — this is ordinary copy-on-write state, so it doesn't meet the bar that makes
 * dominoes/store.ts a justified exception (see CLAUDE.md's "State" section).
 */
export interface InventorySlice {
  // ---- Domino Inventory (Domino Inventory screen) ----
  // A flat catalog of domino *types*, distinct from the placed-domino SoA data
  // in dominoes/store.ts. Small (dozens of rows), not performance-sensitive,
  // so it's a plain array here rather than a Record<id, Entry> — unlike
  // ddObjects, nothing here needs O(1) id-keyed lookup or parent/child
  // bookkeeping. Ephemeral: reseeded fresh every load, like the rest of the store.
  inventoryEntries: InventoryEntry[];
  // Next counter value for minting "INV-#" ids.
  nextInventoryNumber: number;
  // Prepend a new entry at the top with the spec's defaults; dropdown fields
  // default to the current mode across existing entries.
  addInventoryEntry: () => void;
  // The single write path for inline cell edits.
  updateInventoryEntry: (id: InventoryEntryId, patch: Partial<InventoryEntry>) => void;
  // Bulk delete (the trash-can button), called only after the confirm dialog.
  removeInventoryEntries: (ids: readonly InventoryEntryId[]) => void;
  /**
   * Swaps the whole catalog out, for an uploaded CSV. Called only after the
   * confirm dialog, and — like every other action here — records no undo entry:
   * nothing about this screen is undoable, which is why its prompts say so.
   *
   * The counter has to come in alongside the entries rather than be derived
   * here, because it must clear the numbers the *replaced* inventory used as
   * well as the ones arriving (see inventoryCsv.ts's resolveIds). Dominoes on
   * the build plane hold colour numbers, so reissuing one to a different colour
   * would recolour them.
   */
  replaceInventory: (entries: InventoryEntry[], nextNumber: number) => void;

  // Row ids checked via the Select column, for bulk delete.
  inventorySelectedIds: Record<InventoryEntryId, true>;
  toggleInventorySelected: (id: InventoryEntryId) => void;
  // Used by the Select column header's select-all/none checkbox.
  setAllInventorySelected: (ids: readonly InventoryEntryId[], selected: boolean) => void;

  // Single active sort key + direction; null column = unsorted (seed/insertion order).
  inventorySortColumn: InventorySortColumn | null;
  inventorySortDirection: "asc" | "desc";
  // Clicking a header: same column reverses direction, a different column
  // sorts by it ascending.
  setInventorySort: (column: InventorySortColumn) => void;
}

/**
 * StateCreator's first type argument is the *whole* AppState, not just this
 * slice — that's what types `set`/`get` against every other slice's members, so
 * inventory actions could read app state outside this file without any
 * plumbing. The last argument narrows what this creator must return, so
 * dropping a member here is a type error rather than a runtime hole.
 */
export const createInventorySlice: StateCreator<AppState, [], [], InventorySlice> = (set) => {
  // Held in a local so the counter can be derived from the seed rather than
  // restated as a literal, which would drift the moment a seed row is added.
  const seedEntries = createSeedInventory();

  return {
    inventoryEntries: seedEntries,
    nextInventoryNumber: nextInventoryNumberFor(seedEntries),
    addInventoryEntry: () =>
      set((s) => {
        const numericId = s.nextInventoryNumber;
        const id: InventoryEntryId = `INV-${numericId}`;
        const entry: InventoryEntry = {
          id,
          numericId,
          active: true,
          colorName: "New Color",
          color: NEW_ENTRY_COLOR,
          material: modeDefault(s.inventoryEntries, "material", MATERIAL_OPTIONS),
          finish: modeDefault(s.inventoryEntries, "finish", FINISH_OPTIONS),
          brand: modeDefault(s.inventoryEntries, "brand", BRAND_OPTIONS),
          available: 0,
          shortcut: "",
          notes: "",
        };
        return {
          inventoryEntries: [entry, ...s.inventoryEntries],
          nextInventoryNumber: s.nextInventoryNumber + 1,
        };
      }),
    updateInventoryEntry: (id, patch) =>
      set((s) => ({
        inventoryEntries: s.inventoryEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),
    removeInventoryEntries: (ids) =>
      set((s) => {
        const doomed = new Set(ids);
        return {
          inventoryEntries: s.inventoryEntries.filter((e) => !doomed.has(e.id)),
          inventorySelectedIds: {},
        };
      }),
    replaceInventory: (entries, nextNumber) =>
      set(() => ({
        inventoryEntries: entries,
        nextInventoryNumber: nextNumber,
        // The checked ids named rows that no longer exist.
        inventorySelectedIds: {},
      })),

    inventorySelectedIds: {},
    toggleInventorySelected: (id) =>
      set((s) => {
        const next = { ...s.inventorySelectedIds };
        if (next[id]) delete next[id];
        else next[id] = true;
        return { inventorySelectedIds: next };
      }),
    setAllInventorySelected: (ids, selected) =>
      set(() => {
        if (!selected) return { inventorySelectedIds: {} };
        const next: Record<InventoryEntryId, true> = {};
        for (const id of ids) next[id] = true;
        return { inventorySelectedIds: next };
      }),

    inventorySortColumn: null,
    inventorySortDirection: "asc",
    setInventorySort: (column) =>
      set((s) =>
        s.inventorySortColumn === column
          ? { inventorySortDirection: s.inventorySortDirection === "asc" ? "desc" : "asc" }
          : { inventorySortColumn: column, inventorySortDirection: "asc" },
      ),
  };
};