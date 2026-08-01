import { create } from "zustand";

import { useStore, isDDObjectInUndoHistory } from "../store";
import { getDominoCellId, type DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import { useDominoDataStore } from "./store";
import type { DominoData } from "./object-model";

/**
 * Generic, registry-driven memory that lets a domino-producing DDObject's
 * dominoes survive a regenerate (component remount on a screen switch, a
 * resize, an undo/redo of either) with their colors intact, instead of the
 * blunt "wipe every domino back to unpainted" a fresh `generateDominoes()`
 * call would otherwise mean. Deliberately lives here — in the generic,
 * grid-agnostic `dominoes/` subsystem — rather than under `fieldElement/`,
 * so any future domino-producing type (a spiral, concentric rings, ...)
 * gets the same preservation for free just by declaring its own
 * `dominoCellId` (object-types/base.ts) — see that doc comment for the
 * stability contract a cell id must uphold.
 */
export interface DominoColorMemory {
  /**
   * stable-cell-id -> colorId. Monotonically accumulates for the parent's
   * whole life — entries are only ever added/updated, never deleted when a
   * cell falls outside the currently-live range — so shrinking then growing
   * back (whether in the same gesture or a separate, later one) restores
   * colors with no "operation boundary" tracking needed.
   */
  colorByCell: Map<number, number>;
  /**
   * The ddObject as it was the last time this parent's DominoData was
   * generated — needed to correctly decode that live data's flat indices
   * into stable cell ids (via getDominoCellId) before it's overwritten.
   * Plain DDObjects are cheap, JSON-safe data, so storing a full snapshot is
   * simplest and keeps this module fully type-agnostic: it never inspects
   * the ddObject's own fields, only ever hands it to the type's own
   * registry-declared dominoCellId.
   */
  lastDDObject: DDObject;
}

interface DominoColorMemoryStore {
  entries: Map<DDObjectId, DominoColorMemory>;
  get: (parentId: DDObjectId) => DominoColorMemory | undefined;
  put: (parentId: DDObjectId, memory: DominoColorMemory) => void;
}

// No `versions` counter, unlike dominoes/store.ts/selectionStore.ts — nothing
// subscribes to this reactively, it's only ever touched imperatively from
// inside restoreDominoColors below.
export const useDominoColorMemoryStore = create<DominoColorMemoryStore>((_set, get) => ({
  entries: new Map(),
  get: (parentId) => get().entries.get(parentId),
  put: (parentId, memory) => {
    get().entries.set(parentId, memory);
  },
}));

/**
 * Absorbs the currently-live DominoData's colors into persistent memory
 * (keyed by each domino's stable cell id under whatever ddObject was live
 * last time — not the raw flat index, since a regenerate can change what a
 * flat index means), then populates `newData.colorIds` for any cell
 * `newDDObject` has painted before. Call once per regenerate, after
 * computing `newData`'s positions but before `put()`-ing it into
 * useDominoDataStore. A no-op if the type declares no `dominoCellId`.
 */
export function restoreDominoColors(newDDObject: DDObject, newData: DominoData): void {
  const cellIdNew = getDominoCellId(newDDObject);
  if (!cellIdNew) return;

  const store = useDominoColorMemoryStore.getState();
  const existing = store.get(newDDObject.id);
  const colorByCell = existing ? new Map(existing.colorByCell) : new Map<number, number>();

  const liveData = useDominoDataStore.getState().get(newDDObject.id);
  const cellIdOld = existing && getDominoCellId(existing.lastDDObject);
  if (liveData && cellIdOld) {
    for (let i = 0; i < liveData.count; i++) {
      const colorId = liveData.colorIds[i];
      if (colorId !== 0) colorByCell.set(cellIdOld(i), colorId);
    }
  }

  for (let i = 0; i < newData.count; i++) {
    const remembered = colorByCell.get(cellIdNew(i));
    if (remembered !== undefined) newData.colorIds[i] = remembered;
  }

  store.put(newDDObject.id, { colorByCell, lastDDObject: newDDObject });
}

/**
 * Keep `colorByCell` in sync with an explicit color change to a set of
 * dominoes — the initial paint (`applyColorToSelectedDominoes`) or an
 * undo/redo of one — as opposed to `restoreDominoColors`'s regenerate-time
 * absorb/restore. Without this, `colorByCell` can only ever gain entries:
 * it has no way to learn that a previously-painted cell has since been
 * explicitly reverted to unpainted (colorId 0) by an undo, since
 * `restoreDominoColors`'s absorb step only ever records nonzero colors and
 * treats a zero as "nothing to absorb," never as "clear this cell." A
 * later regenerate — e.g. the remount that happens when this DDObject's
 * own delete/create is itself undone or redone — would then read the
 * stale, still-nonzero memory and repaint the cell, resurrecting a color
 * the user had explicitly undone. `ddObject` must be the parent's CURRENT
 * ddObject: a color change never itself changes layout, so its
 * `dominoCellId` decode is valid for `indices` regardless of whether a
 * regenerate has run since colorByCell was last touched.
 */
export function syncDominoColorMemory(
  ddObject: DDObject,
  indices: ArrayLike<number>,
  colorIds: ArrayLike<number>,
): void {
  const cellIdFn = getDominoCellId(ddObject);
  if (!cellIdFn) return;

  const store = useDominoColorMemoryStore.getState();
  const existing = store.get(ddObject.id);
  const colorByCell = existing ? existing.colorByCell : new Map<number, number>();

  for (let k = 0; k < indices.length; k++) {
    const cellId = cellIdFn(indices[k]);
    const colorId = colorIds[k];
    if (colorId === 0) colorByCell.delete(cellId);
    else colorByCell.set(cellId, colorId);
  }

  store.put(ddObject.id, { colorByCell, lastDDObject: existing?.lastDDObject ?? ddObject });
}

/**
 * Prune a parent's color memory once its DDObject is truly gone — absent from
 * ddObjects *and* unreachable via any undo/redo (isDDObjectInUndoHistory,
 * store.ts), not the instant it leaves ddObjects: a delete is undoable, and
 * pruning immediately would mean undoing it brings the DDObject back with no
 * memory of its dominoes' colors to restore. Call once at startup, from
 * main.tsx; returns zustand's unsubscribe. Mirrors dominoes/store.ts's
 * initDominoData and dominoes/selectionStore.ts's initDominoSelectionPruning,
 * including why this is an explicit init rather than a module-load side
 * effect: this module reads the main store, and subscribing at module load
 * could run before it's finished constructing (registry -> fieldElement's
 * object-model -> this module -> main store -> registry is the same
 * import-cycle shape those two already have).
 */
export function initDominoColorMemoryPruning() {
  return useStore.subscribe((state, prev) => {
    // Also re-check on undoStack/redoStack changes — see dominoes/store.ts's
    // initDominoData, which needs the identical reasoning.
    if (
      state.ddObjects === prev.ddObjects &&
      state.undoStack === prev.undoStack &&
      state.redoStack === prev.redoStack
    ) {
      return;
    }
    const { entries } = useDominoColorMemoryStore.getState();
    for (const id of entries.keys()) {
      if (!state.ddObjects[id] && !isDDObjectInUndoHistory(id)) entries.delete(id);
    }
  });
}