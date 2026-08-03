import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import type { DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import type { InventoryEntryId } from "../domino-inventory/object-model";
import { pushOperation, type Operation } from "../history/appStoreSlice";
import { useDominoSelectionStore } from "./selectionStore";
import { useDominoDataStore } from "./store";
import type { DominoData } from "./object-model";
import { syncDominoColorMemory } from "./colorMemory";
import { resolveDominoColorPaste } from "./rowColPaste";
import type { DominoColorClipboardItem } from "./clipboardItem";

/**
 * Per-domino colour editing: the swatch/shortcut/lock state of domino editing
 * mode, and the five writes that change a domino's colour.
 *
 * These are a slice of the app store rather than of this folder's own
 * `store.ts` because each one needs `undoStack`, `ddObjects` and
 * `dominoEditingId` *together* — the SoA store holds none of those, and a
 * separate store would fork the undo stack, which the single-timeline design
 * rules out (see history/appStoreSlice.ts). The columns they mutate live in
 * `store.ts` next door; only the orchestration is here.
 *
 * ---- Import-cycle note ----
 * As with history/appStoreSlice.ts, store.ts must remain the only importer of
 * `createDominoColorSlice`: this module reaches ./store and ./colorMemory, which
 * import useStore back from store.ts. Entered from here rather than from
 * store.ts, store.ts's body would run mid-evaluation and call the creator before
 * the const is initialized. That fails loudly at startup, not silently.
 */

/**
 * The one write path for a batch of domino color changes — shared by the color
 * swatches, cut, and paste, all of which need the identical sequence: filter to
 * the dominoes that actually change, mutate the colorIds column in place,
 * signal, and keep the cross-regenerate color memory in step.
 *
 * Returns the operation to push, or null when nothing actually changed, so no
 * empty undo step gets recorded (opening a color and re-applying the one a
 * domino already has adds nothing to the history). It doesn't push itself —
 * callers are inside `set` and do that.
 *
 * The syncDominoColorMemory call is not optional: skipping it lets a later
 * regenerate resurrect a color that was just cut or overwritten. See that
 * function's own doc comment for the full failure mode.
 */
function commitDominoColors(
  parentId: DDObjectId,
  ddObject: DDObject | undefined,
  data: DominoData,
  targets: Iterable<[index: number, colorId: number]>,
): Operation | null {
  const indices: number[] = [];
  const before: number[] = [];
  const after: number[] = [];
  for (const [i, colorId] of targets) {
    // i >= count: a selection left stale by a shrink. hidden: a tombstoned
    // domino isn't drawn, so painting it would be invisible bookkeeping.
    if (i >= data.count || data.hidden[i]) continue;
    if (data.colorIds[i] === colorId) continue; // already this color
    indices.push(i);
    before.push(data.colorIds[i]);
    after.push(colorId);
  }
  if (indices.length === 0) return null;

  for (let k = 0; k < indices.length; k++) data.colorIds[indices[k]] = after[k];
  useDominoDataStore.getState().bump(parentId);

  const afterArray = Uint32Array.from(after);
  if (ddObject) syncDominoColorMemory(ddObject, indices, afterArray);

  return {
    kind: "dominoColors",
    parentId,
    indices: Uint32Array.from(indices),
    before: Uint32Array.from(before),
    after: afterArray,
  };
}

export interface DominoColorSlice {
  // The inventory color currently locked (null = none). While locked, every
  // newly-selected domino (by any means) is immediately recolored to it —
  // see DominoEditTool.tsx's applyLockedColorIfAny. Cleared on exiting
  // domino editing mode.
  dominoColorLockedId: InventoryEntryId | null;
  toggleDominoColorLock: (entryId: InventoryEntryId) => void;
  // The in-progress shortcut being typed to pick a color (see the domino
  // inventory's own `shortcut` column) — e.g. "B" while narrowing toward
  // "B1"/"B2". Cleared on a unique match, Space-disambiguation, Escape, a
  // new pointer gesture, ~1.2s of inactivity, or exiting the mode.
  dominoColorShortcut: string;
  setDominoColorShortcut: (buffer: string) => void;
  // Recolors every currently-selected domino (in the field currently being
  // domino-edited) to `entryId`'s color and pushes one undoable
  // "dominoColors" operation covering exactly the dominoes that actually
  // changed. A no-op if nothing is selected or every selected domino
  // already has this color.
  applyColorToSelectedDominoes: (entryId: InventoryEntryId) => void;
  // Clears every currently-selected domino back to unpainted (the 0 sentinel)
  // as one undoable step — Delete/Backspace in domino editing mode. Distinct
  // from cut, which does the same clear but also overwrites the clipboard.
  clearSelectedDominoColors: () => void;

  // ---- Domino editing mode's cancel snapshot ----
  // The edited DDObject's whole colorIds column as of entering the mode, and the
  // restore that puts it back (both no-ops outside the mode). This is what makes
  // Cancel exact. Replaying the undo stack backwards cannot be: HISTORY_LIMIT
  // drops entries off the front, so past that many in-mode edits the earliest
  // ones are simply gone and the field would come back partly painted, with no
  // indication anything was missed. A snapshot is immune to the cap by
  // construction.
  //
  // Deliberately just this one column, because it is the only thing the mode can
  // change today — a future in-mode feature that moves, adds or deletes dominoes
  // must widen this to whatever else it touches, or Cancel silently stops being
  // exact again.
  dominoEditingColorSnapshot: Uint32Array | null;
  captureDominoColorSnapshot: (parentId: DDObjectId) => void;
  restoreDominoColorSnapshot: () => void;

  // ---- Domino color clipboard ----
  // The domino-editing half of the app clipboard (clipboard/store.ts owns the
  // slot and the Cut/Copy/Paste commands; dominoes/clipboardHandlers.ts wraps
  // these three as the handler pair it registers). They live here rather than
  // in the clipboard subsystem because each needs the undo stack, ddObjects and
  // dominoEditingId — exactly what applyColorToSelectedDominoes above needs.
  //
  // All three no-op outside domino editing mode or with an empty selection.
  // Copy builds the buffer without recording undo; cut additionally clears the
  // copied dominoes to unpainted as one undo step; paste applies the item and
  // pushes one more.
  copySelectedDominoColors: () => DominoColorClipboardItem | undefined;
  cutSelectedDominoColors: () => DominoColorClipboardItem | undefined;
  pasteDominoColorClipboard: (item: DominoColorClipboardItem) => void;
}

export const createDominoColorSlice: StateCreator<AppState, [], [], DominoColorSlice> = (
  set,
  get,
) => ({
  dominoColorLockedId: null,
  toggleDominoColorLock: (entryId) =>
    set((s) => ({ dominoColorLockedId: s.dominoColorLockedId === entryId ? null : entryId })),
  dominoColorShortcut: "",
  setDominoColorShortcut: (buffer) => set({ dominoColorShortcut: buffer }),

  applyColorToSelectedDominoes: (entryId) => {
    const s = get();
    const parentId = s.dominoEditingId;
    if (!parentId) return;
    const entry = s.inventoryEntries.find((e) => e.id === entryId);
    if (!entry) return;
    const targetId = entry.numericId;
    const selected = useDominoSelectionStore.getState().get(parentId)?.selected;
    if (!selected || selected.size === 0) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    const op = commitDominoColors(
      parentId,
      s.ddObjects[parentId],
      data,
      [...selected].map((i) => [i, targetId] as [number, number]),
    );
    if (op) set((st) => pushOperation(st.undoStack, op));
  },

  clearSelectedDominoColors: () => {
    const s = get();
    const parentId = s.dominoEditingId;
    if (!parentId) return;
    const selected = useDominoSelectionStore.getState().get(parentId)?.selected;
    if (!selected || selected.size === 0) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    const op = commitDominoColors(
      parentId,
      s.ddObjects[parentId],
      data,
      // 0 is the unpainted sentinel, the same clear a cut performs — minus the
      // clipboard write, which is the whole reason this isn't just Ctrl+X.
      [...selected].map((i) => [i, 0] as [number, number]),
    );
    if (op) set((st) => pushOperation(st.undoStack, op));
  },

  dominoEditingColorSnapshot: null,
  captureDominoColorSnapshot: (parentId) => {
    const data = useDominoDataStore.getState().get(parentId);
    // A plain copy of the live column: the SoA buffers are mutated in place, so
    // holding the reference would snapshot nothing.
    set({ dominoEditingColorSnapshot: data ? data.colorIds.slice() : null });
  },
  restoreDominoColorSnapshot: () => {
    const s = get();
    const parentId = s.dominoEditingId;
    const snapshot = s.dominoEditingColorSnapshot;
    if (!parentId || !snapshot) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    // min(): the snapshot spans the capacity it was taken at. Nothing can resize
    // the field from inside the mode today, but a mismatch here must clip rather
    // than read past either buffer.
    const n = Math.min(snapshot.length, data.count);
    const targets: [number, number][] = [];
    for (let i = 0; i < n; i++) targets.push([i, snapshot[i]]);

    // Through commitDominoColors like every other colour write, so the restore
    // inherits the colorByCell sync — without it a later regenerate would
    // repaint the very colors this just discarded. The operation it returns is
    // dropped: a cancelled session records no history, exactly as a cancelled
    // properties dialog records none.
    commitDominoColors(parentId, s.ddObjects[parentId], data, targets);
  },

  copySelectedDominoColors: () => {
    const s = get();
    const parentId = s.dominoEditingId;
    if (!parentId) return undefined;
    const ddObject = s.ddObjects[parentId];
    if (!ddObject) return undefined;
    const selected = useDominoSelectionStore.getState().get(parentId)?.selected;
    if (!selected || selected.size === 0) return undefined;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return undefined;

    // Ascending so the buffer reads in layout order; hidden and stale indices
    // are dropped here so no consumer has to re-check them.
    const indices = [...selected]
      .filter((i) => i < data.count && !data.hidden[i])
      .sort((a, b) => a - b);
    if (indices.length === 0) return undefined;

    return {
      type: "dominoColors",
      label: `${indices.length} domino color${indices.length === 1 ? "" : "s"}`,
      // Holding the reference is the snapshot — ddObjects are copy-on-write.
      sourceDDObject: ddObject,
      indices: Uint32Array.from(indices),
      colorIds: Uint32Array.from(indices, (i) => data.colorIds[i]),
    };
  },

  cutSelectedDominoColors: () => {
    const s = get();
    const item = s.copySelectedDominoColors();
    if (!item) return undefined;
    const parentId = s.dominoEditingId;
    // dominoEditingId and the DominoData were both non-null for the copy above
    // to have succeeded; re-read rather than assert.
    const data = parentId ? useDominoDataStore.getState().get(parentId) : undefined;
    if (!parentId || !data) return item;

    // Cut is immediate rather than Excel's deferred-until-paste model: the
    // colors clear now, and the buffer is already filled. Note the item is
    // still returned when nothing actually changed (cutting an all-unpainted
    // selection is a valid copy) — it just records no undo step.
    const op = commitDominoColors(
      parentId,
      s.ddObjects[parentId],
      data,
      // 0 is the unpainted sentinel — a cut clears rather than deletes.
      Array.from(item.indices, (i) => [i, 0] as [number, number]),
    );
    if (op) set((st) => pushOperation(st.undoStack, op));
    return item;
  },

  pasteDominoColorClipboard: (item) => {
    const s = get();
    const parentId = s.dominoEditingId;
    if (!parentId) return;
    const ddObject = s.ddObjects[parentId];
    if (!ddObject) return;
    const selection = useDominoSelectionStore.getState().get(parentId);
    if (!selection || selection.selected.size === 0) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    // All the geometry — corner correlation, tiling, truncation, holes — lives
    // in the row/col paste; this half only applies the result.
    const targets = resolveDominoColorPaste(item, ddObject, selection, data.count);
    if (!targets) return;

    const op = commitDominoColors(parentId, ddObject, data, targets);
    if (op) set((st) => pushOperation(st.undoStack, op));
  },
});