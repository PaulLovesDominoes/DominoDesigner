import { create } from "zustand";

import { useStore, isDDObjectInUndoHistory } from "../store";
import type { DDObjectId } from "../object-types/base";
import type { DominoData } from "./object-model";

/**
 * A dedicated store for bulk per-domino data, kept separate from the main app
 * store on purpose. The main store is immutable copy-on-write; these columns are
 * huge and mutated in place — cloning them on every edit (or snapshotting them
 * for the properties dialog's rollback) would be pathological. So the discipline
 * here is the opposite: mutate the typed arrays directly, then bump a version
 * counter so subscribers know to re-read. `dominoes` is keyed by the id of the
 * parent element that owns the dominoes.
 */
interface DominoDataStore {
  /** parent element id → its dominoes. The Map is stable; entries mutate in place. */
  dominoes: Map<DDObjectId, DominoData>;
  /** parent element id → a counter bumped on any change to its dominoes. */
  versions: Record<DDObjectId, number>;
  get: (parentId: DDObjectId) => DominoData | undefined;
  /** Replace a parent's dominoes wholesale (e.g. a layout regenerate) and signal. */
  put: (parentId: DDObjectId, data: DominoData) => void;
  /** Signal that a parent's dominoes were edited in place (positions/colors/…). */
  bump: (parentId: DDObjectId) => void;
}

export const useDominoDataStore = create<DominoDataStore>((set, get) => ({
  dominoes: new Map(),
  versions: {},

  get: (parentId) => get().dominoes.get(parentId),

  put: (parentId, data) =>
    set((s) => {
      s.dominoes.set(parentId, data);
      return { versions: { ...s.versions, [parentId]: (s.versions[parentId] ?? 0) + 1 } };
    }),

  bump: (parentId) =>
    set((s) => ({
      versions: { ...s.versions, [parentId]: (s.versions[parentId] ?? 0) + 1 },
    })),
}));

/**
 * Start freeing a parent's dominoes once its DDObject is truly gone — absent
 * from ddObjects *and* unreachable via any undo/redo (isDDObjectInUndoHistory,
 * store.ts). Not the instant it leaves ddObjects: a delete is undoable, and if
 * its dominoes were freed immediately, undoing the delete would bring the
 * DDObject back with no memory of its dominoes' colors — they'd already be
 * gone. Call once at startup, from main.tsx; returns zustand's unsubscribe.
 *
 * Deliberately an explicit init rather than a module-load side effect. There is
 * an import cycle here — registry → fieldElement's object-model → this store →
 * main store → registry — which is harmless only because nothing reads across it
 * while the modules are initialising. Subscribing at module load would break
 * exactly that rule: it would touch `useStore` while the main store is still
 * mid-construction. Calling it from the entry point keeps the ordering explicit
 * and the dependency one-way (dominoes knows about the DDObject store, never
 * the reverse).
 */
export function initDominoData() {
  return useStore.subscribe((state, prev) => {
    // Also re-check on undoStack/redoStack changes, not just ddObjects — a
    // deleted DDObject's dominoes must stay alive for as long as its "delete"
    // operation is still undoable (see isDDObjectInUndoHistory), and that
    // reachability can change (a delete aging off the history cap, or being
    // discarded when the redo stack is cleared) without ddObjects itself
    // changing on that particular update.
    if (
      state.ddObjects === prev.ddObjects &&
      state.undoStack === prev.undoStack &&
      state.redoStack === prev.redoStack
    ) {
      return;
    }
    const { dominoes, versions } = useDominoDataStore.getState();
    let pruned = false;
    const nextVersions = { ...versions };
    for (const parentId of dominoes.keys()) {
      if (!state.ddObjects[parentId] && !isDDObjectInUndoHistory(parentId)) {
        dominoes.delete(parentId);
        delete nextVersions[parentId];
        pruned = true;
      }
    }
    if (pruned) useDominoDataStore.setState({ versions: nextVersions });
  });
}
