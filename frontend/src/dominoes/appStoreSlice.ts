import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import type { DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import type { InventoryEntry, InventoryEntryId } from "../domino-inventory/object-model";
import { pushOperation, type Operation } from "../history/appStoreSlice";
import { useDominoSelectionStore } from "./selectionStore";
import { useDominoDataStore } from "./store";
import {
  isHiddenColorId,
  withHiddenColorId,
  withoutHiddenColorId,
  type DominoData,
} from "./object-model";
import {
  HIDE_SWATCH_ID,
  UNASSIGNED_SWATCH_ID,
  type DominoSelectMode,
  type DominoSwatchId,
} from "./swatches";
import { syncDominoColorMemory } from "./colorMemory";
import { resolveDominoColorPaste } from "./rowColPaste";
import type { DominoColorClipboardItem } from "./clipboardItem";

/**
 * Per-domino colour editing: the swatch/shortcut/lock state of domino editing
 * mode, and the five writes that change a domino's colour. Domino editing mode's
 * other transient view state (the Expand toggle) rides along at the bottom —
 * same lifetime, same clear-on-exit.
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
 * The one write path for *which dominoes are selected*, shared by every command
 * that produces a whole selection at once (select-by-swatch, select all, invert).
 * The canvas gestures in DominoEditor don't come through here — they build
 * their corners from where the pointer actually was — but they end the same way,
 * which is why applyLockedSwatchIfAny is an action rather than living in either
 * place.
 *
 * Three details, each of which was a bug or nearly one:
 *
 * - **The lowest index is found by iterating, never `Math.min(...selected)`.**
 *   Spreading a Set creates one argument per element, and V8 exhausts the call
 *   stack somewhere around 65k — a 250x250 field is 62,500 dominoes, so Select
 *   All would reliably crash.
 * - Both selection corners seed a following Shift+Arrow, which needs a defined
 *   corner to extend from; baseSelection preserves everything produced here
 *   beneath that rectangle. Same shape as DominoEditor's Ctrl+click branch.
 * - An empty result clears instead of replacing, and applies no lock — there is
 *   nothing to apply it to, the same rule a clearing gesture already follows.
 */
function writeDominoSelection(
  get: () => AppState,
  parentId: DDObjectId,
  selected: Set<number>,
) {
  const store = useDominoSelectionStore.getState();
  if (selected.size === 0) {
    store.clear(parentId);
    return;
  }
  let lowest = Infinity;
  for (const i of selected) if (i < lowest) lowest = i;

  store.replace(parentId, {
    selected,
    baseSelection: new Set(selected),
    selectionFixedCornerIndex: lowest,
    selectionMovingCornerIndex: lowest,
  });
  get().applyLockedSwatchIfAny();
}

/**
 * The one variant of Operation this file produces. Named so commitDominoColors
 * can return it precisely rather than as the whole union — a paint stroke reads
 * the indices/before columns straight off what it returns, which the union
 * cannot answer for.
 */
type DominoColorsOperation = Extract<Operation, { kind: "dominoColors" }>;

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
): DominoColorsOperation | null {
  const indices: number[] = [];
  const before: number[] = [];
  const after: number[] = [];
  for (const [i, colorId] of targets) {
    // i >= count: a selection left stale by a shrink.
    if (i >= data.count) continue;
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

/**
 * The (index, colorId) pairs a swatch implies over `indices` — the one place
 * that answers "what does this swatch mean as a colour write", shared by the
 * swatch clicks, the Delete/Backspace keys and a paint brush's stroke.
 *
 * Returns undefined only for an inventory swatch that no longer exists, which
 * every caller treats as "nothing to do".
 *
 * Hide is the reason this takes `data`: hiding is a flag added to whatever
 * colour the domino will return to, so its target depends on the domino, where
 * the other two are the same value for every index (see CLAUDE.md's note on
 * HIDDEN_COLOR_FLAG).
 */
function swatchTargets(
  swatchId: DominoSwatchId,
  inventoryEntries: readonly InventoryEntry[],
  data: DominoData,
  indices: Iterable<number>,
): [number, number][] | undefined {
  let targetFor: (index: number) => number;
  if (swatchId === HIDE_SWATCH_ID) {
    targetFor = (i) => withHiddenColorId(data.colorIds[i]);
  } else if (swatchId === UNASSIGNED_SWATCH_ID) {
    // 0 is the unpainted sentinel, the same clear a cut performs — minus the
    // clipboard write, which is the whole reason that isn't just Ctrl+X.
    targetFor = () => 0;
  } else {
    const entry = inventoryEntries.find((e) => e.id === swatchId);
    if (!entry) return undefined;
    targetFor = () => entry.numericId;
  }

  const targets: [number, number][] = [];
  for (const i of indices) targets.push([i, targetFor(i)]);
  return targets;
}

/** The `set`/`get` this slice's creator is handed, so the helpers below can take them. */
type SliceSet = Parameters<StateCreator<AppState, [], [], DominoColorSlice>>[0];
type SliceGet = () => AppState;

/**
 * Apply one swatch to whatever is selected, as a single undo step. The shared
 * body of the three swatch actions, which differ only in which swatch they name:
 * the guard prologue (in the mode, something selected, dominoes exist) and the
 * commit-then-push tail were identical in all three.
 *
 * A paint brush's stroke deliberately does NOT come through here — it needs the
 * same swatch resolution but must not push per frame. It shares swatchTargets
 * instead.
 */
function applySwatchToSelection(set: SliceSet, get: SliceGet, swatchId: DominoSwatchId) {
  const s = get();
  const parentId = s.dominoEditingId;
  if (!parentId) return;
  const selected = useDominoSelectionStore.getState().get(parentId)?.selected;
  if (!selected || selected.size === 0) return;
  const data = useDominoDataStore.getState().get(parentId);
  if (!data) return;

  const targets = swatchTargets(swatchId, s.inventoryEntries, data, selected);
  if (!targets) return;

  const op = commitDominoColors(parentId, s.ddObjects[parentId], data, targets);
  if (op) set((st) => pushOperation(st.undoStack, op));
}

export interface DominoColorSlice {
  // The swatch currently locked (null = none) — an inventory color, or Hide, or
  // Unassigned. While locked, every newly-selected domino (by any means) has it
  // applied immediately; see DominoEditor.tsx's applyLockedColorIfAny.
  // Cleared on exiting domino editing mode.
  dominoColorLockedId: DominoSwatchId | null;
  toggleDominoColorLock: (swatchId: DominoSwatchId) => void;
  // Applies the locked swatch, if any, to whatever is selected right now.
  // Called after every gesture and command that *changes* which dominoes are
  // selected — that is the whole meaning of locking, and it lives here rather
  // than in DominoEditor so the store's own selection commands (select all,
  // invert, the swatch menus) reach it too. A no-op when nothing is locked.
  applyLockedSwatchIfAny: () => void;
  // The in-progress shortcut being typed to pick a color (see the domino
  // inventory's own `shortcut` column) — e.g. "B" while narrowing toward
  // "B1"/"B2". Cleared on a unique match, Space-disambiguation, Escape, a
  // new pointer gesture, ~1.2s of inactivity, or exiting the mode.
  //
  // Only inventory entries have a typeable shortcut. The Hide and Unassigned
  // swatches show "DEL"/"Bksp", which name the keys that apply them — they are
  // labels, not sequences this buffer can ever match.
  dominoColorShortcut: string;
  setDominoColorShortcut: (buffer: string) => void;
  // The one entry point for "apply a swatch to the selection", used by the color
  // panel, the lock, and the Delete/Backspace keys alike, so all three can't
  // drift. Dispatches to the three writes below; each pushes at most one
  // undoable "dominoColors" operation covering exactly the dominoes that
  // actually changed, and no-ops on an empty selection.
  applyDominoSwatch: (swatchId: DominoSwatchId) => void;
  // Recolors every currently-selected domino (in the field currently being
  // domino-edited) to `entryId`'s color. Note this *unhides* any hidden domino
  // it touches, for free: it writes a raw numericId, which is below
  // HIDDEN_COLOR_FLAG (see object-model.ts).
  applyColorToSelectedDominoes: (entryId: InventoryEntryId) => void;
  // Clears every currently-selected domino back to unpainted (the 0 sentinel),
  // which likewise unhides. Backspace, and the Unassigned swatch. Distinct from
  // cut, which does the same clear but also overwrites the clipboard.
  clearSelectedDominoColors: () => void;
  // Hides every currently-selected domino, leaving its color underneath to
  // return to. Deliberately never a toggle — clicking Hide is "make these
  // hidden" the way clicking Red is "make these red", which is also what lets
  // the Hide swatch be locked without flip-flopping. unhideSelectedDominoes is
  // the swatch menu's separate Unhide command.
  hideSelectedDominoes: () => void;
  unhideSelectedDominoes: () => void;
  // Selects the dominoes matching a swatch, combined with the live selection per
  // `mode` (see DominoSelectMode). Matching is plain equality on the stored
  // colorId, so a color swatch takes only *visible* dominoes of that color and
  // Hide takes exactly the hidden ones, whatever color they'll return to.
  selectDominoesBySwatch: (swatchId: DominoSwatchId, mode: DominoSelectMode) => void;
  // Every domino in the field being edited, hidden ones included — they are
  // dominoes, and selecting them is how the whole field gets unhidden at once.
  selectAllDominoes: () => void;
  // Selected becomes deselected and vice versa. With nothing selected this is
  // select-all, which is the right reading of the set operation and needs no
  // special case.
  invertDominoSelection: () => void;

  // ---- Paint brush strokes ----
  // One freehand stroke in progress: the dominoes it has recolored so far, and
  // the color each of them had *before* the stroke started. Null between
  // strokes. See paint-brush/base.ts for the tools that drive it.
  //
  // This exists because a stroke inverts the rule every other color write in the
  // app follows. All of those write and record in the same breath — which is
  // exactly why DominoEditor is careful never to apply a locked color inside a
  // pointermove (it would push an undo entry per frame). A stroke has to write
  // live, so the user sees paint appear under the nib, but record only once, so
  // Ctrl+Z takes back the whole stroke rather than one flick of it.
  //
  // The map is what makes both halves of that work: `end` reads it to build one
  // operation covering everything painted, and `cancel` feeds it straight back
  // through the same write path to undo the stroke with nothing recorded.
  dominoStroke: { parentId: DDObjectId; before: Map<number, number> } | null;
  // Opens a stroke. No-op outside the mode or with no swatch locked — a brush
  // with nothing to lay down has nothing to do.
  beginDominoStroke: () => void;
  // Paints `indices` with the locked swatch, folding them into the open stroke
  // rather than recording anything. Safe to call every frame with a set the
  // previous frame already covered: the shared write path skips any domino
  // already at the target color.
  paintDominoStroke: (indices: Iterable<number>) => void;
  // Closes the stroke, pushing everything it painted as ONE undoable operation.
  // Pushes nothing if the stroke touched no dominoes.
  endDominoStroke: () => void;
  // Abandons the stroke, putting every domino it painted back to the color it
  // had before, and records nothing — Escape mid-stroke.
  cancelDominoStroke: () => void;

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

  // ---- Domino editing mode's Expand toggle ----
  // Whether the edited element's dominoes are drawn oversized, so tightly-spaced
  // ones are easier to click and rubber-band. How much bigger is the element
  // type's own decision (DDObjectTypeDefinition.dominoExpansion); this is only
  // the on/off, and dominoes/expansion.ts resolves the two together.
  //
  // A view setting, not document state: no undo entry, nothing persisted, and
  // exitDominoEditing clears it — which is what makes leaving the mode restore
  // the real sizes without any extra wiring.
  dominoExpanded: boolean;
  toggleDominoExpanded: () => void;
}

export const createDominoColorSlice: StateCreator<AppState, [], [], DominoColorSlice> = (
  set,
  get,
) => ({
  dominoColorLockedId: null,
  toggleDominoColorLock: (swatchId) =>
    set((s) => ({ dominoColorLockedId: s.dominoColorLockedId === swatchId ? null : swatchId })),
  applyLockedSwatchIfAny: () => {
    const lockedId = get().dominoColorLockedId;
    if (lockedId) get().applyDominoSwatch(lockedId);
  },
  dominoColorShortcut: "",
  setDominoColorShortcut: (buffer) => set({ dominoColorShortcut: buffer }),

  applyDominoSwatch: (swatchId) => {
    const s = get();
    if (swatchId === HIDE_SWATCH_ID) s.hideSelectedDominoes();
    else if (swatchId === UNASSIGNED_SWATCH_ID) s.clearSelectedDominoColors();
    else s.applyColorToSelectedDominoes(swatchId);
  },

  applyColorToSelectedDominoes: (entryId) => applySwatchToSelection(set, get, entryId),

  // 0 is the unpainted sentinel — see swatchTargets.
  clearSelectedDominoColors: () => applySwatchToSelection(set, get, UNASSIGNED_SWATCH_ID),

  // withHiddenColorId leaves an already-hidden domino alone, and
  // commitDominoColors then drops it as a no-op recolor — so hiding an
  // all-hidden selection records nothing rather than an empty undo step.
  hideSelectedDominoes: () => applySwatchToSelection(set, get, HIDE_SWATCH_ID),

  unhideSelectedDominoes: () => {
    const s = get();
    const parentId = s.dominoEditingId;
    if (!parentId) return;
    const selected = useDominoSelectionStore.getState().get(parentId)?.selected;
    if (!selected || selected.size === 0) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    // Mirror of the above: a fully visible selection is a no-op, which is what
    // makes this safe as a menu command rather than a mode.
    const op = commitDominoColors(
      parentId,
      s.ddObjects[parentId],
      data,
      [...selected].map((i) => [i, withoutHiddenColorId(data.colorIds[i])] as [number, number]),
    );
    if (op) set((st) => pushOperation(st.undoStack, op));
  },

  selectDominoesBySwatch: (swatchId, mode) => {
    const s = get();
    const parentId = s.dominoEditingId;
    if (!parentId) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    // Plain equality on the stored colorId, deliberately unmasked: a hidden
    // value is at or above HIDDEN_COLOR_FLAG, so it can never equal a small
    // numericId or 0. That is the whole of "a color swatch selects only the
    // visible dominoes of that color" — no filtering needed on top.
    let matches: (colorId: number) => boolean;
    if (swatchId === HIDE_SWATCH_ID) {
      matches = isHiddenColorId;
    } else if (swatchId === UNASSIGNED_SWATCH_ID) {
      matches = (colorId) => colorId === 0;
    } else {
      const entry = s.inventoryEntries.find((e) => e.id === swatchId);
      if (!entry) return;
      matches = (colorId) => colorId === entry.numericId;
    }

    // Built in one pass, then combined — rather than mutating the previous
    // selection in the loop — because "intersect" can't be expressed that way:
    // it has to drop selected dominoes the loop never visits.
    const matching = new Set<number>();
    for (let i = 0; i < data.count; i++) if (matches(data.colorIds[i])) matching.add(i);

    const previous = useDominoSelectionStore.getState().get(parentId)?.selected ?? new Set();
    let selected: Set<number>;
    if (mode === "replace") {
      selected = matching;
    } else if (mode === "add") {
      selected = new Set(previous);
      for (const i of matching) selected.add(i);
    } else if (mode === "remove") {
      selected = new Set(previous);
      for (const i of matching) selected.delete(i);
    } else {
      selected = new Set<number>();
      for (const i of previous) if (matching.has(i)) selected.add(i);
    }

    writeDominoSelection(get, parentId, selected);
  },

  selectAllDominoes: () => {
    const parentId = get().dominoEditingId;
    if (!parentId) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    const selected = new Set<number>();
    for (let i = 0; i < data.count; i++) selected.add(i);
    writeDominoSelection(get, parentId, selected);
  },

  invertDominoSelection: () => {
    const parentId = get().dominoEditingId;
    if (!parentId) return;
    const data = useDominoDataStore.getState().get(parentId);
    if (!data) return;

    const previous = useDominoSelectionStore.getState().get(parentId)?.selected;
    const selected = new Set<number>();
    for (let i = 0; i < data.count; i++) if (!previous?.has(i)) selected.add(i);
    writeDominoSelection(get, parentId, selected);
  },

  dominoStroke: null,

  beginDominoStroke: () => {
    const s = get();
    if (!s.dominoEditingId || !s.dominoColorLockedId) return;
    set({ dominoStroke: { parentId: s.dominoEditingId, before: new Map() } });
  },

  paintDominoStroke: (indices) => {
    const s = get();
    const stroke = s.dominoStroke;
    const swatchId = s.dominoColorLockedId;
    if (!stroke || !swatchId) return;
    const data = useDominoDataStore.getState().get(stroke.parentId);
    if (!data) return;

    const targets = swatchTargets(swatchId, s.inventoryEntries, data, indices);
    if (!targets || targets.length === 0) return;

    // The same write path every other colour change uses, so the stroke inherits
    // the in-place column write, the version bump the modeller redraws on, and
    // the cross-regenerate colour memory sync. What is different is the last
    // line: the operation it hands back is folded into the stroke instead of
    // being pushed, which is the whole of "one undo entry per stroke".
    const op = commitDominoColors(stroke.parentId, s.ddObjects[stroke.parentId], data, targets);
    if (!op) return; // every domino was already this colour

    for (let k = 0; k < op.indices.length; k++) {
      const index = op.indices[k];
      // First value seen wins. A domino the nib passes over twice would
      // otherwise remember the colour the *first* pass left, and undoing the
      // stroke would leave it painted.
      if (!stroke.before.has(index)) stroke.before.set(index, op.before[k]);
    }
    // The map is mutated in place; nothing subscribes to it, and the live
    // redraw comes from the data store's version bump above.
  },

  endDominoStroke: () => {
    const s = get();
    const stroke = s.dominoStroke;
    if (!stroke) return;
    set({ dominoStroke: null });
    if (stroke.before.size === 0) return;

    const data = useDominoDataStore.getState().get(stroke.parentId);
    if (!data) return;

    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    for (const [index, priorColorId] of stroke.before) {
      if (index >= data.count) continue;
      const currentColorId = data.colorIds[index];
      if (currentColorId === priorColorId) continue; // painted, then painted back
      indices.push(index);
      before.push(priorColorId);
      after.push(currentColorId);
    }
    if (indices.length === 0) return;

    // Built by hand rather than through commitDominoColors, because the columns
    // are already written — every frame of the stroke wrote them, and syncing
    // colour memory along the way. All that is left is the history entry.
    set((st) =>
      pushOperation(st.undoStack, {
        kind: "dominoColors",
        parentId: stroke.parentId,
        indices: Uint32Array.from(indices),
        before: Uint32Array.from(before),
        after: Uint32Array.from(after),
      }),
    );
  },

  cancelDominoStroke: () => {
    const s = get();
    const stroke = s.dominoStroke;
    if (!stroke) return;
    set({ dominoStroke: null });

    const data = useDominoDataStore.getState().get(stroke.parentId);
    if (!data) return;

    // Back through commitDominoColors, exactly as restoreDominoColorSnapshot
    // below does, so the restore re-syncs colour memory too — without that a
    // later regenerate would repaint the very colours this just discarded. The
    // operation it returns is dropped: an abandoned stroke records no history,
    // the same way a cancelled properties dialog records none.
    commitDominoColors(stroke.parentId, s.ddObjects[stroke.parentId], data, stroke.before);
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

    // Ascending so the buffer reads in layout order; stale indices are dropped
    // here so no consumer has to re-check them.
    const indices = [...selected].filter((i) => i < data.count).sort((a, b) => a - b);
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

  dominoExpanded: false,
  toggleDominoExpanded: () => set((s) => ({ dominoExpanded: !s.dominoExpanded })),
});