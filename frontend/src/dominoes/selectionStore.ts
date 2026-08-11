import { create } from "zustand";

import { useStore } from "../store";
import type { DDObjectId } from "../object-types/base";

/**
 * Per-parent domino selection state for domino editing mode. Kept in its own
 * small store, separate from both the main copy-on-write store and the bulk
 * per-domino columns in dominoes/store.ts, since this is UI/gesture state that
 * a whole selection-defining gesture replaces wholesale (see DominoEditor.tsx)
 * rather than something mutated column-by-column.
 *
 * The two corner indices and baseSelection are domino *indices* and physical
 * positions, never grid row/column — the dominoes subsystem knows nothing about
 * grids (see object-model.ts's header comment), so keeping selection spatial
 * means it needs no rework when a future domino-producing type isn't a grid at
 * all.
 *
 * The two corners exist for exactly one consumer: DominoEditor's runShiftArrow,
 * which walks the moving corner one domino per press and refills the selection
 * from the rectangle spanning the two. Every other write site merely seeds them
 * so that a *following* Shift+Arrow has somewhere to extend from — nothing else
 * in the mode (colouring, hiding, the clipboard, the swatch menus) reads them,
 * so they are not "the current domino" in any general sense.
 */
export interface DominoSelectionEntry {
  /** The live, displayed set — what actually gets a white outline. */
  selected: Set<number>;
  /** Preserved while Shift+Arrow grows/shrinks a rectangle on top of it. */
  baseSelection: Set<number>;
  /** Domino index — the corner Shift+Arrow's rectangle pivots around. */
  selectionFixedCornerIndex: number;
  /** Domino index — the corner each Shift+Arrow press steps to a neighbour. */
  selectionMovingCornerIndex: number;
}

interface DominoSelectionStore {
  /** parent element id -> its domino selection. */
  entries: Map<DDObjectId, DominoSelectionEntry>;
  /** parent element id -> a counter bumped on any change to its selection. */
  versions: Record<DDObjectId, number>;
  get: (parentId: DDObjectId) => DominoSelectionEntry | undefined;
  /** Replace a parent's selection wholesale and signal. */
  replace: (parentId: DDObjectId, entry: DominoSelectionEntry) => void;
  /** Discard a parent's selection (e.g. on exiting domino editing mode) and signal. */
  clear: (parentId: DDObjectId) => void;
}

export const useDominoSelectionStore = create<DominoSelectionStore>((set, get) => ({
  entries: new Map(),
  versions: {},

  get: (parentId) => get().entries.get(parentId),

  replace: (parentId, entry) =>
    set((s) => {
      s.entries.set(parentId, entry);
      return { versions: { ...s.versions, [parentId]: (s.versions[parentId] ?? 0) + 1 } };
    }),

  clear: (parentId) =>
    set((s) => {
      if (!s.entries.has(parentId)) return {};
      s.entries.delete(parentId);
      return { versions: { ...s.versions, [parentId]: (s.versions[parentId] ?? 0) + 1 } };
    }),
}));

/**
 * Start freeing a parent's domino selection when its DDObject leaves the
 * hierarchy. Call once at startup, from main.tsx; returns zustand's unsubscribe.
 * Mirrors dominoes/store.ts's initDominoData — see its comment for why this is an
 * explicit init call rather than a module-load side effect (the same import
 * cycle applies here: registry -> fieldElement's object-model -> this store ->
 * main store -> registry, harmless only because nothing reads across it while
 * modules are initialising).
 *
 * Deliberately pruned immediately, unlike dominoes/store.ts's DominoData or
 * colorMemory.ts's DominoColorMemory — those defer pruning until a delete is
 * no longer undoable (isDDObjectInUndoHistory) so colors survive an undo.
 * Which dominoes were *selected* isn't state a user expects back after
 * undoing a delete, so there's nothing worth keeping alive here.
 */
export function initDominoSelectionPruning() {
  return useStore.subscribe((state, prev) => {
    if (state.ddObjects === prev.ddObjects) return;
    const { entries, versions } = useDominoSelectionStore.getState();
    let pruned = false;
    const nextVersions = { ...versions };
    for (const parentId of entries.keys()) {
      if (!state.ddObjects[parentId]) {
        entries.delete(parentId);
        delete nextVersions[parentId];
        pruned = true;
      }
    }
    if (pruned) useDominoSelectionStore.setState({ versions: nextVersions });
  });
}