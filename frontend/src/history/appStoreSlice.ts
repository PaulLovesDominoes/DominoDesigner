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
// Type-only, so TypeScript erases it and no import appears in the built
// JavaScript at all — which is what keeps this module free of a value import
// that could drag store.ts in through image-map/assetStore.ts.
import type { DominoImageMap } from "../image-map/object-model";
// A value import, unlike the one above — but a safe one. visibility.ts imports
// nothing but a type, so it pulls no module into this one's runtime
// dependencies and cannot open a path back to store.ts.
import { imageMadeOnScreen, isImageOnScreen } from "../image-map/visibility";

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
 *
 * "imageMap" is the picture laid over an element, and one variant covers all
 * three things that can happen to one: a null `before` is a picture being added,
 * a null `after` one being deleted, and two records set is either a move/resize
 * or a replacement. Splitting those into separate kinds looks tidier and costs
 * an extra kind for the replacement case, which is neither an add nor a delete
 * but both at once.
 *
 * Note it covers the picture's *geometry* and its comings and goings, not
 * hide/unhide, transparency or layer. Those three are view aids — Ctrl+I is a
 * glance toggle, like Expand — and filling the undo stack with them would bury
 * the edits a user actually wants back. The two cases that apply this kind do
 * still *read* them, to make sure an undo is something the user can see; see
 * revealBeforeApplying.
 *
 * These entries live only as long as the domino editing session that made them:
 * exitDominoEditing filters them off both stacks, since a picture is only ever
 * drawn inside that mode. See the comment there.
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
    }
  | {
      kind: "imageMap";
      parentId: DDObjectId;
      /** The element's picture before, or null if it had none. */
      before: DominoImageMap | null;
      /** The picture after, or null if it was deleted. */
      after: DominoImageMap | null;
    };

// Undo entries are capped so a long session can't grow the stack unbounded.
const HISTORY_LIMIT = 100;

/** Push a new operation and clear the redo stack, per standard undo/redo semantics. */
export function pushOperation(undoStack: Operation[], op: Operation) {
  return { undoStack: [...undoStack, op].slice(-HISTORY_LIMIT), redoStack: [] as Operation[] };
}

/**
 * The imageMaps table with one element's picture set to `image`, or with that
 * element's entry taken out when `image` is null. Shared by undo and redo, which
 * differ only in which side of the operation they put back.
 *
 * A picture being put back is forced on screen. Without that, undoing the delete
 * of a picture the user had hidden would restore it still hidden — a Ctrl+Z with
 * no visible effect at all, which is the thing these two cases exist to prevent.
 * Nothing is lost by it: neither hiding nor transparency is undoable in the first
 * place, so there is no earlier state of them for this to contradict.
 */
function imageMapsWith(
  imageMaps: Record<DDObjectId, DominoImageMap>,
  parentId: DDObjectId,
  image: DominoImageMap | null,
): Record<DDObjectId, DominoImageMap> {
  if (image) return { ...imageMaps, [parentId]: imageMadeOnScreen(image) };
  if (!imageMaps[parentId]) return imageMaps;
  const next = { ...imageMaps };
  delete next[parentId];
  return next;
}

/**
 * The first half of "an image undo must always show the user something".
 *
 * If the element's picture is on the element but not on the screen — hidden, or
 * wound to fully transparent — this brings it back into view and reports true,
 * meaning *the press has been spent*. The caller must then leave the operation
 * where it is: the next press applies it for real, now that its effect can be
 * seen. One press, one visible change, which is the same rule the Escape ladder
 * in domino editing mode follows.
 *
 * It covers a picture that is still there (add, then hide, then undo). The other
 * half — a picture that has been deleted, so there is nothing here to reveal —
 * is imageMapsWith's forcing above.
 */
function revealBeforeApplying(
  imageMaps: Record<DDObjectId, DominoImageMap>,
  parentId: DDObjectId,
  set: (patch: { imageMaps: Record<DDObjectId, DominoImageMap> }) => void,
): boolean {
  const current = imageMaps[parentId];
  if (!current || isImageOnScreen(current)) return false;
  set({ imageMaps: { ...imageMaps, [parentId]: imageMadeOnScreen(current) } });
  return true;
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
    case "imageMap":
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
      case "imageMap":
        // A picture the user cannot see is brought into view first, and that
        // press does nothing else — see revealBeforeApplying. The operation stays
        // on the stack for the next one.
        if (revealBeforeApplying(s.imageMaps, op.parentId, set)) break;
        // A picture lives outside ddObjects, as colors do, so this leaves the
        // hierarchy and the selection alone: putting one back has to work
        // whether or not its element is being edited right now.
        //
        // Its decoded pixels are still in assetStore.ts, even for a picture that
        // was deleted or replaced — nothing frees an asset while an operation on
        // either stack still names it, which is exactly what makes this undo
        // instant rather than having to decode the file again.
        set({
          imageMaps: imageMapsWith(s.imageMaps, op.parentId, op.before),
          undoStack,
          redoStack,
        });
        break;
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
      case "imageMap":
        // The mirror of undo's case: same reasoning, other side of the record.
        if (revealBeforeApplying(s.imageMaps, op.parentId, set)) break;
        set({
          imageMaps: imageMapsWith(s.imageMaps, op.parentId, op.after),
          undoStack,
          redoStack,
        });
        break;
    }
  },

  recordTransform: (before, after) =>
    set((s) =>
      ddObjectsEqual(before, after)
        ? {}
        : pushOperation(s.undoStack, { kind: "transform", before, after }),
    ),
});