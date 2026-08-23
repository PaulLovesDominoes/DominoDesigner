import { create } from "zustand";

import { MAX_LAYER, MIN_LAYER } from "./constants";
import type { StructureOperationId } from "./operation-types/base";
import {
  createStructureOperation,
  getOperationDefaultName,
  type StructureOperation,
  type StructureOperationType,
} from "./operation-types/registry";

/**
 * The Structure Designer's own state, deliberately kept out of the app store in
 * store.ts.
 *
 * The two halves of the app — designing a floor of dominoes, and designing a
 * three-dimensional structure — are meant to share as little as possible, so
 * each can change without breaking the other. Their eventual meeting point is a
 * JSON description of a structure, which the Designer will read to create an
 * element from; nothing before that needs to be shared. Keeping this state in
 * its own store is what makes that real rather than a promise: store.ts is not
 * touched at all, and nothing on the Designer side can reach in here by
 * accident.
 *
 * (CLAUDE.md's rule that only a different mutation discipline earns a store of
 * its own is about features *inside* the designer. This is a whole second half
 * of the app, and dominoes/store.ts, clipboard/store.ts and
 * image-map/assetStore.ts are the precedent for a feature owning its store.)
 *
 * Members are not prefixed with "structure" — the store already names the
 * domain, so call sites read useStructureStore((s) => s.layer). They do say
 * "operation" or "undo edit" where either could be meant, because those are two
 * different things here and the words are easy to swap by accident.
 *
 * On the import cycle: this module imports the operation registry, the registry
 * imports each type's definition, and a definition may name an editor component
 * that imports this store back. That is safe because nothing here *calls* a
 * registry function while the module is being evaluated — the calls all sit
 * inside actions, by which time every module in the ring has finished. Keep it
 * that way; a registry call at module scope here would break on whichever
 * module happened to be imported first.
 */

/**
 * One undoable change to the structure being designed.
 *
 * Whole-operation snapshots throughout, never per-field patches — the same rule
 * the Designer's history follows, and for the same reason: an operation's
 * fields are read together and there is nothing meaningful to diff piecemeal.
 *
 * `index` is on "create" as well as "delete" because the operations are an
 * ordered list and the order *is* the meaning — the first layer definition
 * describes layer 1 upward and the next carries on from it. Undoing and then
 * redoing a creation has to put it back in the slot it came from, which
 * appending would not.
 */
export type StructureUndoEdit =
  | { kind: "create"; operation: StructureOperation; index: number }
  | { kind: "delete"; operation: StructureOperation; index: number }
  | { kind: "properties"; before: StructureOperation; after: StructureOperation };

/**
 * Undo entries are capped so a long session can't grow the stack unbounded.
 * Its own copy of the number the Designer's history uses rather than an import
 * of it — the two halves of the app share no code, and a helper this small is
 * not worth a coupling that has to be reasoned about later.
 */
const HISTORY_LIMIT = 100;

/**
 * Push a new edit and clear the redo stack, per standard undo/redo semantics.
 * Returns a patch for the caller to spread into its own set().
 */
const pushUndoEdit = (undoStack: StructureUndoEdit[], edit: StructureUndoEdit) => ({
  undoStack: [...undoStack, edit].slice(-HISTORY_LIMIT),
  redoStack: [] as StructureUndoEdit[],
});

// ── Raw list helpers ──
// Undo and redo go through these rather than through the actions above, so
// applying history can never itself record history. That is a structural fix
// rather than a suppression flag: a helper that cannot reach an action cannot
// accidentally record one. cancelOperationProperties' discard-a-creation path
// uses the same route, and for a sharper reason — see there.

const operationsWithout = (
  operations: StructureOperation[],
  id: StructureOperationId,
) => operations.filter((operation) => operation.id !== id);

const operationsWith = (
  operations: StructureOperation[],
  operation: StructureOperation,
  index: number,
) => {
  const next = [...operations];
  next.splice(index, 0, operation);
  return next;
};

const operationsReplacing = (
  operations: StructureOperation[],
  operation: StructureOperation,
) => operations.map((o) => (o.id === operation.id ? operation : o));

/** Cheap because it only ever runs at a commit, never per keystroke. */
const operationsEqual = (a: StructureOperation, b: StructureOperation) =>
  JSON.stringify(a) === JSON.stringify(b);

/** The camera pose kept across a screen switch. See StructureCameraRig.tsx. */
export interface SavedView {
  /** Where the camera sits, in world mm. */
  position: [number, number, number];
  /** The point it orbits around and looks at. */
  target: [number, number, number];
  zoom: number;
}

/**
 * Imperative handle on the three.js camera, registered from inside the R3F
 * <Canvas> by StructureCameraRig and used by the toolbar's zoom buttons, which
 * live outside it.
 *
 * Deliberately not the CameraApi in types.ts: that one's frameDDObject exists
 * to frame an object in the DDObject hierarchy, and this screen has none.
 */
export interface StructureCameraApi {
  /** Multiply the current zoom (e.g. 1.05 to zoom in 5%). */
  zoomBy: (factor: number) => void;
  /** Set an absolute zoom level. */
  zoomTo: (zoom: number) => void;
  /**
   * Fit the whole build plane in view *and* return the camera to looking
   * straight down. The two go together on purpose: once the view has been
   * tilted with Shift+Right-drag there is no other control that straightens it
   * again, so this doubles as the way back from a disorienting angle.
   */
  resetView: () => void;
}

interface StructureState {
  /** Which layer is being worked on, MIN_LAYER..MAX_LAYER. */
  layer: number;
  setLayer: (layer: number) => void;

  /**
   * Whether to draw a faint sheet at every layer of the structure, rather than
   * only at the one being worked on. A view aid: it records no history and is
   * not part of the structure's description.
   */
  showAllLayers: boolean;
  toggleShowAllLayers: () => void;

  /**
   * The structure, as an ordered list of steps for building it. Order is
   * meaning, not presentation — see StructureUndoEdit.
   */
  operations: StructureOperation[];
  nextOperationNumber: number;

  /** Which operation's properties dialog is open (null = closed); one at a time. */
  modifyingOperationId: StructureOperationId | null;
  /**
   * Set when the open dialog is a *creation* rather than a change to something
   * that already exists. It is the whole difference between the two: Cancel on
   * a creation discards the operation, Cancel on a change rolls it back. It is
   * also what the dialog's primary button reads its wording from.
   */
  creatingOperationId: StructureOperationId | null;
  /**
   * The operation as it stood when the dialog opened. Edits are written straight
   * into `operations` so the canvas previews them live, so this is the only
   * record of what to put back if the user cancels.
   */
  modifyingSnapshot: StructureOperation | null;

  /** Mint an operation of `type`, append it, and open its properties to create. */
  createOperation: (type: StructureOperationType) => void;
  /** The single write path for property editors: shallow-merge into an operation. */
  updateOperation: (
    id: StructureOperationId,
    patch: Partial<StructureOperation>,
  ) => void;
  openOperationProperties: (id: StructureOperationId) => void;
  /** Keep the edited values, record one undo entry, and close. */
  saveOperationProperties: () => void;
  /** Discard: a creation is removed outright, a change is rolled back. Then close. */
  cancelOperationProperties: () => void;
  /** Delete an operation outright, recording one undo entry. */
  removeOperation: (id: StructureOperationId) => void;

  cameraApi: StructureCameraApi | null;
  setCameraApi: (cameraApi: StructureCameraApi | null) => void;

  savedView: SavedView | null;
  setSavedView: (savedView: SavedView | null) => void;

  undoStack: StructureUndoEdit[];
  redoStack: StructureUndoEdit[];
  undo: () => void;
  redo: () => void;
}

export const useStructureStore = create<StructureState>()((set, get) => ({
  layer: MIN_LAYER,
  // Clamped here rather than at the call sites, so every way of changing the
  // layer — dragging the slider, its arrow keys, and whatever is added later —
  // is clamped once, in one place.
  setLayer: (layer) =>
    set({ layer: Math.min(MAX_LAYER, Math.max(MIN_LAYER, Math.round(layer))) }),

  showAllLayers: false,
  toggleShowAllLayers: () => set((s) => ({ showAllLayers: !s.showAllLayers })),

  operations: [],
  nextOperationNumber: 1,

  modifyingOperationId: null,
  creatingOperationId: null,
  modifyingSnapshot: null,

  createOperation: (type) =>
    set((s) => {
      const number = s.nextOperationNumber;
      const id = `SOP-${number}`;
      const operation = {
        ...createStructureOperation(type, id),
        // The number is added here rather than by the type, because it is not
        // a fact about the type. The sidebar is a flat list of rows that look
        // alike, so the number is what makes one tellable from another; the
        // Designer's hierarchy has distinct icons and a selection instead, which
        // is why its defaultName carries no number.
        name: `${getOperationDefaultName(type)} ${number}`,
      };

      return {
        nextOperationNumber: number + 1,
        // Appended. Inserting it next to the layer being viewed is a plausible
        // refinement and deliberately not done — the list reads as a recipe, and
        // a new step arriving in the middle of one would be a surprise.
        operations: [...s.operations, operation],
        // Open the dialog straight away, flagged as a creation so Cancel
        // discards the operation rather than rolling its properties back.
        // Nothing is pushed onto the undo stack until Create is pressed.
        modifyingOperationId: id,
        modifyingSnapshot: operation,
        creatingOperationId: id,
      };
    }),

  updateOperation: (id, patch) =>
    set((s) => {
      const operation = s.operations.find((o) => o.id === id);
      if (!operation) return {};
      return {
        operations: operationsReplacing(s.operations, {
          ...operation,
          ...patch,
        } as StructureOperation),
      };
    }),

  openOperationProperties: (id) =>
    set((s) => ({
      modifyingOperationId: id,
      modifyingSnapshot: s.operations.find((o) => o.id === id) ?? null,
    })),

  saveOperationProperties: () =>
    set((s) => {
      const base = {
        modifyingOperationId: null,
        modifyingSnapshot: null,
        creatingOperationId: null,
      };

      // A creation's "before" state is "didn't exist" — always record, and
      // record the whole finished operation rather than each edit made while
      // the dialog was open (Cancel would have discarded them all anyway).
      if (s.creatingOperationId) {
        const index = s.operations.findIndex((o) => o.id === s.creatingOperationId);
        if (index < 0) return base;
        return {
          ...base,
          ...pushUndoEdit(s.undoStack, {
            kind: "create",
            operation: s.operations[index],
            index,
          }),
        };
      }

      // A plain change: diff the pre-dialog snapshot against the live operation.
      // Equal means nothing actually changed — Update-with-no-edits records
      // nothing.
      const snapshot = s.modifyingSnapshot;
      if (snapshot) {
        const live = s.operations.find((o) => o.id === snapshot.id);
        if (live && !operationsEqual(snapshot, live)) {
          return {
            ...base,
            ...pushUndoEdit(s.undoStack, {
              kind: "properties",
              before: snapshot,
              after: live,
            }),
          };
        }
      }

      return base;
    }),

  cancelOperationProperties: () =>
    set((s) => {
      const base = {
        modifyingOperationId: null,
        modifyingSnapshot: null,
        creatingOperationId: null,
      };

      // Cancelling a creation discards the operation outright — it was never
      // saved, so no "create" was ever pushed either. This goes through the raw
      // helper rather than removeOperation, or it would push a "delete" with
      // nothing to pair against, and Undo would then resurrect an operation the
      // user explicitly discarded.
      if (s.creatingOperationId) {
        return {
          ...base,
          operations: operationsWithout(s.operations, s.creatingOperationId),
        };
      }

      const snapshot = s.modifyingSnapshot;
      if (!snapshot) return base;
      return { ...base, operations: operationsReplacing(s.operations, snapshot) };
    }),

  removeOperation: (id) =>
    set((s) => {
      const index = s.operations.findIndex((o) => o.id === id);
      if (index < 0) return {};
      return {
        operations: operationsWithout(s.operations, id),
        ...pushUndoEdit(s.undoStack, {
          kind: "delete",
          operation: s.operations[index],
          index,
        }),
        // The dialog sits above a scrim that covers the sidebar, so its menu
        // cannot be reached while one is open. Cleared anyway, so a future route
        // to Delete cannot strand the dialog on an operation that is gone.
        ...(s.modifyingOperationId === id
          ? {
              modifyingOperationId: null,
              modifyingSnapshot: null,
              creatingOperationId: null,
            }
          : {}),
      };
    }),

  cameraApi: null,
  setCameraApi: (cameraApi) => set({ cameraApi }),

  savedView: null,
  setSavedView: (savedView) => set({ savedView }),

  undoStack: [],
  redoStack: [],

  undo: () => {
    const s = get();
    const edit = s.undoStack[s.undoStack.length - 1];
    if (!edit) return;
    const undoStack = s.undoStack.slice(0, -1);
    const redoStack = [...s.redoStack, edit];

    switch (edit.kind) {
      case "create":
        set({
          operations: operationsWithout(s.operations, edit.operation.id),
          undoStack,
          redoStack,
        });
        break;
      case "delete":
        set({
          operations: operationsWith(s.operations, edit.operation, edit.index),
          undoStack,
          redoStack,
        });
        break;
      case "properties":
        set({
          operations: operationsReplacing(s.operations, edit.before),
          undoStack,
          redoStack,
        });
        break;
    }
  },

  redo: () => {
    const s = get();
    const edit = s.redoStack[s.redoStack.length - 1];
    if (!edit) return;
    const redoStack = s.redoStack.slice(0, -1);
    const undoStack = [...s.undoStack, edit];

    switch (edit.kind) {
      case "create":
        set({
          operations: operationsWith(s.operations, edit.operation, edit.index),
          undoStack,
          redoStack,
        });
        break;
      case "delete":
        set({
          operations: operationsWithout(s.operations, edit.operation.id),
          undoStack,
          redoStack,
        });
        break;
      case "properties":
        set({
          operations: operationsReplacing(s.operations, edit.after),
          undoStack,
          redoStack,
        });
        break;
    }
  },
}));