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

  /**
   * parent element id -> the dominoes under a paint brush's nib right now.
   *
   * **This is not a selection, and keeping the two apart is load-bearing.** The
   * hover is drawn the same white, but it is transient feedback that follows the
   * pointer, where `entries` above is what the user deliberately picked out. They
   * used to be the same set, and every awkward rule the brush needed came from
   * that: a hover wiped a real selection on the next mouse move, Escape could not
   * offer "clear the selection" under a brush, and a shortcut key painted
   * whatever the nib happened to be over. Do not merge them back.
   */
  brushHover: Map<DDObjectId, Set<number>>;
  /**
   * Bumped on any change to `brushHover`, and deliberately **separate** from
   * `versions`. A brush rewrites its hover on almost every pointermove, and
   * DominoEditor subscribes to `versions` to rebuild the clipboard handlers
   * whose enablement depends on the selection — sharing one counter would
   * rebuild and re-register those handlers at pointer-event rate.
   */
  hoverVersions: Record<DDObjectId, number>;
  getBrushHover: (parentId: DDObjectId) => Set<number> | undefined;
  setBrushHover: (parentId: DDObjectId, indices: Iterable<number>) => void;
  clearBrushHover: (parentId: DDObjectId) => void;
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

  brushHover: new Map(),
  hoverVersions: {},

  getBrushHover: (parentId) => get().brushHover.get(parentId),

  setBrushHover: (parentId, indices) =>
    set((s) => {
      s.brushHover.set(parentId, new Set(indices));
      return {
        hoverVersions: { ...s.hoverVersions, [parentId]: (s.hoverVersions[parentId] ?? 0) + 1 },
      };
    }),

  // Returning {} on a miss keeps a redundant clear free — the brush calls this
  // on every frame its nib covers nothing.
  clearBrushHover: (parentId) =>
    set((s) => {
      if (!s.brushHover.has(parentId)) return {};
      s.brushHover.delete(parentId);
      return {
        hoverVersions: { ...s.hoverVersions, [parentId]: (s.hoverVersions[parentId] ?? 0) + 1 },
      };
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
    const { entries, versions, brushHover, hoverVersions } = useDominoSelectionStore.getState();

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

    // The brush hover goes the same way, for the same reason.
    let prunedHover = false;
    const nextHoverVersions = { ...hoverVersions };
    for (const parentId of brushHover.keys()) {
      if (!state.ddObjects[parentId]) {
        brushHover.delete(parentId);
        delete nextHoverVersions[parentId];
        prunedHover = true;
      }
    }
    if (prunedHover) useDominoSelectionStore.setState({ hoverVersions: nextHoverVersions });
  });
}