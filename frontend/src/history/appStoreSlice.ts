import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import type { DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import {
  applyInsertDDObjects,
  applyRemoveDDObject,
  ddObjectsEqual,
} from "../ddObjectOps";
import { useDominoDataStore } from "../dominoes/store";
import { syncDominoColorMemory } from "../dominoes/colorMemory";

/**
 * Undo/redo: one unified stack over every DDObject-level and domino-color-level
 * change, rather than a stack per subsystem. Two independent histories can't
 * preserve true chronological ordering without effectively rebuilding one
 * timeline anyway, so this stays one stack.
 *
 * Deliberately *not* folded into clipboard/: a clipboard is a transfer buffer,
 * this is a history of operations over the hierarchy. They share nothing but
 * both being Ctrl-chords.
 *
 * ---- Import-cycle note ----
 * store.ts must remain the only importer of `createHistorySlice`. This module
 * reaches dominoes/store.ts and dominoes/colorMemory.ts, both of which import
 * useStore back from store.ts, so the cycle store.ts -> here -> dominoes/* ->
 * store.ts already exists. It is safe *only* while store.ts is the module that
 * enters it: entered from here instead, store.ts's body would run while this
 * module was still mid-evaluation and call `createHistorySlice` before the const
 * is initialized. That fails loudly at startup, not silently. Note the pure
 * hierarchy helpers deliberately come from ddObjectOps.ts rather than store.ts,
 * which is what keeps *this* module free of a direct value import from store.ts.
 */

/**
 * One undoable action. Whole-DDObject snapshots throughout (never per-field
 * patches) — a fieldElement's counts, width/height, position, anchor and row/col
 * origins are all derived from one another, and by different write paths, so a
 * field is far too interdependent to diff/reapply piecemeal. "dominoColors" is the first
 * domino-level operation kind anticipated by that design: before/after are
 * the affected dominoes' previous/new inventory colorIds (0 = unassigned),
 * parallel to indices — typed arrays given how large a selection can get.
 * Applying it reaches into useDominoDataStore rather than ddObjects, and
 * touches neither dominoEditingId nor the domino selection store, which is
 * what lets undo/redo work whether or not domino editing mode is active.
 */
export type Operation =
  | { kind: "create"; ddObject: DDObject; parentId: DDObjectId }
  | { kind: "delete"; subtree: DDObject[]; parentId: DDObjectId; index: number }
  | { kind: "transform"; before: DDObject; after: DDObject }
  | { kind: "properties"; before: DDObject; after: DDObject }
  | {
      kind: "dominoColors";
      parentId: DDObjectId;
      indices: Uint32Array;
      before: Uint32Array;
      after: Uint32Array;
    };

// Undo entries are capped so a long session can't grow the stack unbounded.
const HISTORY_LIMIT = 100;

/** Push a new operation and clear the redo stack, per standard undo/redo semantics. */
export function pushOperation(undoStack: Operation[], op: Operation) {
  return { undoStack: [...undoStack, op].slice(-HISTORY_LIMIT), redoStack: [] as Operation[] };
}

/**
 * Whether `undoStack` holds any operation recorded since `barrier` was taken —
 * i.e. any work done inside domino editing mode. Identity comparison, for the
 * same reason the barrier is an Operation rather than an index (see its
 * declaration below). A null barrier means the stack was empty at entry, so
 * anything on it now is in-mode work.
 *
 * Two readers: undo()'s clamp, and ModeHintBar, which uses it to decide whether
 * Cancel has anything to warn about discarding.
 */
export function hasOperationsSinceBarrier(
  undoStack: Operation[],
  barrier: Operation | null,
): boolean {
  return undoStack.length > 0 && undoStack[undoStack.length - 1] !== barrier;
}

/**
 * Whether `op` still names `id`. Pure, so it can be applied to either stack;
 * store.ts's isDDObjectInUndoHistory is the live-store query built on it.
 * Deliberately conservative: checks every operation kind that could reference
 * `id`, even ones (transform/properties/dominoColors) that don't themselves add
 * or remove it from `ddObjects`, since a delete elsewhere on the stack could
 * still make it currently absent.
 */
export function operationReferencesId(op: Operation, id: DDObjectId): boolean {
  switch (op.kind) {
    case "create":
      return op.ddObject.id === id;
    case "delete":
      return op.subtree.some((d) => d.id === id);
    case "transform":
    case "properties":
      return op.before.id === id || op.after.id === id;
    case "dominoColors":
      return op.parentId === id;
  }
}

export interface HistorySlice {
  // Unified undo/redo history over DDObject-level operations (create, delete,
  // transform, properties) and domino color changes. Not persisted, like the
  // rest of the store.
  undoStack: Operation[];
  redoStack: Operation[];

  // The operation that was on top of undoStack when domino editing mode was
  // entered (null when not in the mode, or when the stack was empty). undo()
  // refuses once that operation is back on top, so undo inside the mode can
  // only reach back to the state the field was in at entry — never past it into
  // whatever created the field or edited it beforehand. Written by store.ts's
  // enterDominoEditing/exitDominoEditing; it lives here because undo() is what
  // gives it meaning.
  //
  // Deliberately the operation *itself* rather than an index or a stack depth:
  // HISTORY_LIMIT drops entries off the front of undoStack, which shifts every
  // index but leaves object identity alone. An index-based barrier has to be
  // slid down on every push to compensate, and forgetting to breaks undo
  // *silently and only in long sessions* — once the stack sits at the cap its
  // length stops growing, so a depth captured there sits at or above the length
  // forever and every in-mode edit refuses to undo. A reference can't drift.
  //
  // If in-mode work is heavy enough to push the barrier off the front, the
  // clamp lapses — correctly, since by then every surviving entry is in-mode
  // work anyway.
  dominoEditingUndoBarrier: Operation | null;

  // Clamped by dominoEditingUndoBarrier while in domino editing mode — see its
  // own doc comment.
  undo: () => void;
  redo: () => void;
  // Records a completed canvas drag (move/resize) as one undo step. Called by
  // SelectionTool at a successful drop; it only records (it never touches
  // ddObjects itself, since the drag's live updateDDObject calls already left
  // the final state in place), and no-ops if before/after are equal (a
  // zero-distance drag).
  recordTransform: (before: DDObject, after: DDObject) => void;
}

export const createHistorySlice: StateCreator<AppState, [], [], HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],
  dominoEditingUndoBarrier: null,

  undo: () => {
    const s = get();
    // Clamped while in domino editing mode — never undo past whatever was
    // already on the stack when the mode was entered. Comparing the top of the
    // stack against the barrier operation directly is what makes this immune to
    // HISTORY_LIMIT shifting every index out from under it; see the barrier's
    // own declaration. Shares one definition with ModeHintBar's "is there
    // anything for Cancel to discard" so the two can't drift apart.
    if (
      s.dominoEditingUndoBarrier !== null &&
      !hasOperationsSinceBarrier(s.undoStack, s.dominoEditingUndoBarrier)
    ) {
      return;
    }
    const op = s.undoStack[s.undoStack.length - 1];
    if (!op) return;
    const undoStack = s.undoStack.slice(0, -1);
    const redoStack = [...s.redoStack, op];

    switch (op.kind) {
      case "create": {
        const result = applyRemoveDDObject(
          s.ddObjects,
          s.rootId,
          s.editingDDObjectId,
          s.selectedDDObjectId,
          s.dominoEditingId,
          op.ddObject.id,
        );
        if (!result) {
          set({ undoStack, redoStack });
          break;
        }
        set({ ...result.patch, undoStack, redoStack, selectedDDObjectId: null });
        break;
      }
      case "delete": {
        const ddObjects = applyInsertDDObjects(s.ddObjects, op.subtree, op.parentId, op.index);
        set({
          ddObjects,
          undoStack,
          redoStack,
          selectedDDObjectId: op.subtree.length === 1 ? op.subtree[0].id : null,
        });
        break;
      }
      case "transform":
      case "properties":
        set({
          ddObjects: { ...s.ddObjects, [op.before.id]: op.before },
          undoStack,
          redoStack,
          selectedDDObjectId: op.before.id,
        });
        break;
      case "dominoColors": {
        const data = useDominoDataStore.getState().get(op.parentId);
        if (data) {
          for (let k = 0; k < op.indices.length; k++) {
            const i = op.indices[k];
            if (i < data.count) data.colorIds[i] = op.before[k];
          }
          useDominoDataStore.getState().bump(op.parentId);
        }
        // Keep colorByCell in sync with the reverted colors too — see
        // syncDominoColorMemory's doc comment for why skipping this would
        // let a later regenerate resurrect the colors this undo just
        // removed.
        const ddObject = s.ddObjects[op.parentId];
        if (ddObject) syncDominoColorMemory(ddObject, op.indices, op.before);
        // Deliberately doesn't touch ddObjects/selectedDDObjectId/
        // dominoEditingId — colors live outside ddObjects, and undoing a
        // color change must work whether or not domino editing mode is
        // currently active.
        set({ undoStack, redoStack });
        break;
      }
    }
  },

  redo: () => {
    const s = get();
    const op = s.redoStack[s.redoStack.length - 1];
    if (!op) return;
    const redoStack = s.redoStack.slice(0, -1);
    const undoStack = [...s.undoStack, op];

    switch (op.kind) {
      case "create": {
        const ddObjects = applyInsertDDObjects(s.ddObjects, [op.ddObject], op.parentId);
        set({ ddObjects, undoStack, redoStack, selectedDDObjectId: op.ddObject.id });
        break;
      }
      case "delete": {
        const result = applyRemoveDDObject(
          s.ddObjects,
          s.rootId,
          s.editingDDObjectId,
          s.selectedDDObjectId,
          s.dominoEditingId,
          op.subtree[0].id,
        );
        if (!result) {
          set({ undoStack, redoStack });
          break;
        }
        set({ ...result.patch, undoStack, redoStack, selectedDDObjectId: null });
        break;
      }
      case "transform":
      case "properties":
        set({
          ddObjects: { ...s.ddObjects, [op.after.id]: op.after },
          undoStack,
          redoStack,
          selectedDDObjectId: op.after.id,
        });
        break;
      case "dominoColors": {
        const data = useDominoDataStore.getState().get(op.parentId);
        if (data) {
          for (let k = 0; k < op.indices.length; k++) {
            const i = op.indices[k];
            if (i < data.count) data.colorIds[i] = op.after[k];
          }
          useDominoDataStore.getState().bump(op.parentId);
        }
        // See the undo case's identical call — keeps colorByCell from
        // going stale relative to the colors this redo just reapplied.
        const ddObject = s.ddObjects[op.parentId];
        if (ddObject) syncDominoColorMemory(ddObject, op.indices, op.after);
        set({ undoStack, redoStack });
        break;
      }
    }
  },

  recordTransform: (before, after) =>
    set((s) =>
      ddObjectsEqual(before, after)
        ? {}
        : pushOperation(s.undoStack, { kind: "transform", before, after }),
    ),
});