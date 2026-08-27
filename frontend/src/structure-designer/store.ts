import { create } from "zustand";

import { MAX_LAYER, MIN_LAYER } from "./constants";
import type { StructureOperationId } from "./operation-types/base";
import {
  effectiveDominoGroup,
  type DominoOrientation,
  type PlacedDomino,
} from "./operation-types/dominoGroup/dominoes";
import type { DominoGroupOperation } from "./operation-types/dominoGroup/object-model";
import {
  createStructureOperation,
  getOperationDefaultName,
  type StructureOperation,
  type StructureOperationType,
} from "./operation-types/registry";
import type { StructureTool } from "./structureToolCommands";

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
 *
 * **"properties" covers any change to an operation's fields, not only one made
 * in a dialog.** The name is the one it has because the dialog was its first
 * user, not because a dialog is required — and it deliberately does not say
 * "modifying", which this screen reserves for the dialog session (see
 * modifyingOperationId).
 *
 * **The two domino edits are the exception to whole-operation snapshots, and
 * they have to be.** A structure runs to tens of thousands of dominoes, and a
 * before-and-after pair of the group would cost a pointer per domino per entry —
 * a hundred and sixty kilobytes an entry at thirty thousand dominoes, sixteen
 * megabytes across the capped stack, for edits that touched one domino each. So
 * these two record only the dominoes that moved and where in the list they sat,
 * which is a fixed handful of bytes however big the structure is.
 *
 * Everything else stays a whole-operation snapshot. Creating and deleting a
 * group are both already that size — the snapshot holds the group's `dominoes`
 * array by reference and nothing ever mutates one — so neither needed splitting.
 */
export type StructureUndoEdit =
  | { kind: "create"; operation: StructureOperation; index: number }
  | { kind: "delete"; operation: StructureOperation; index: number }
  | { kind: "properties"; before: StructureOperation; after: StructureOperation }
  /**
   * Dominoes added to a group that already existed, as one run starting at `at`.
   *
   * `at` is stored rather than assumed even though placement always appends,
   * because redo has to put the run back exactly where undo took it from; "drop
   * the last one" would be right today and quietly wrong the first time
   * something inserts.
   */
  | {
      kind: "dominoesAdded";
      groupId: StructureOperationId;
      at: number;
      dominoes: readonly PlacedDomino[];
    }
  /**
   * Dominoes taken out of a group — one press of Delete, which may take a
   * scattered set.
   *
   * Each carries the index it sat at, **and the list is held in ascending order
   * of index**. That ordering is what makes putting them back a plain loop:
   * inserting ascending into the shortened list lands each one at its own stored
   * index, because everything before it is already back. Taking them out again
   * goes the other way, descending, so that removing one cannot shift the next.
   */
  | {
      kind: "dominoesRemoved";
      groupId: StructureOperationId;
      removed: readonly { index: number; domino: PlacedDomino }[];
    };

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

/**
 * Cheap because it only ever runs at a commit, never per keystroke.
 *
 * A domino group is the one operation whose fields can grow without bound, so
 * this walks its whole list of dominoes when its dialog is closed with Update —
 * tens of thousands of them, in a structure of any size. Once per press of a
 * button is still acceptable; it would not be if this were moved anywhere that
 * runs while something is being dragged, and it is *not* on the path a placement
 * takes (see placeDomino, which knows what changed and records that).
 */
const operationsEqual = (a: StructureOperation, b: StructureOperation) =>
  JSON.stringify(a) === JSON.stringify(b);

// ── Raw helpers for a group's own list of dominoes ──
// The same discipline as the four above: undo and redo reach the document
// through these rather than through an action, so applying history can never
// itself record history. Each rebuilds the list around a new group object rather
// than touching the one already there, because everything from the undo stack to
// useDominoBoxes' cache decides whether anything changed by comparing references.

/** Replace a group's dominoes, leaving the rest of the document alone. */
const operationsWithDominoes = (
  operations: StructureOperation[],
  groupId: StructureOperationId,
  dominoes: PlacedDomino[],
) =>
  operations.map((operation) =>
    operation.id === groupId && operation.type === "dominoGroup"
      ? ({ ...operation, dominoes } as DominoGroupOperation)
      : operation,
  );

/** The group's dominoes, or an empty list if that id is not a group. */
const groupDominoes = (
  operations: StructureOperation[],
  groupId: StructureOperationId,
): readonly PlacedDomino[] => {
  const group = operations.find((o) => o.id === groupId);
  return group?.type === "dominoGroup" ? group.dominoes : [];
};

/** Put a run of dominoes into a group at `at`. */
const dominoesInserted = (
  operations: StructureOperation[],
  groupId: StructureOperationId,
  at: number,
  dominoes: readonly PlacedDomino[],
) => {
  const next = [...groupDominoes(operations, groupId)];
  next.splice(at, 0, ...dominoes);
  return operationsWithDominoes(operations, groupId, next);
};

/**
 * Put back a scattered set of dominoes, each at the index it came from.
 *
 * Ascending, because that is what makes each insert land where it should: by the
 * time one is reached, every domino that sat before it is already back in place.
 */
const dominoesRestored = (
  operations: StructureOperation[],
  groupId: StructureOperationId,
  removed: readonly { index: number; domino: PlacedDomino }[],
) => {
  const next = [...groupDominoes(operations, groupId)];
  for (const entry of removed) next.splice(entry.index, 0, entry.domino);
  return operationsWithDominoes(operations, groupId, next);
};

/**
 * Take a set of dominoes out of a group by index.
 *
 * Filtered rather than spliced one at a time, so the indexes are all read against
 * the list as it was and none of them has to be adjusted for the ones already
 * gone.
 */
const dominoesRemovedAt = (
  operations: StructureOperation[],
  groupId: StructureOperationId,
  indices: ReadonlySet<number>,
) =>
  operationsWithDominoes(
    operations,
    groupId,
    groupDominoes(operations, groupId).filter((_, i) => !indices.has(i)),
  );

/**
 * Mint a fresh operation of `type`, numbered and named but not yet added to
 * anything. Returns the next number to store alongside it.
 *
 * Both routes to a new operation go through here — the toolbar's commands, and
 * the first domino being placed — so there is one place that knows how an id is
 * formed and how a default name is numbered. Two minters would eventually
 * disagree, and the symptom would be two operations sharing an id.
 *
 * The number is added here rather than by the type, because it is not a fact
 * about the type. The sidebar is a flat list of rows that look alike, so the
 * number is what makes one tellable from another; the Designer's hierarchy has
 * distinct icons and a selection instead, which is why its defaultName carries
 * no number.
 */
const mintOperation = (
  nextOperationNumber: number,
  type: StructureOperationType,
) => {
  const id = `SOP-${nextOperationNumber}`;
  return {
    operation: {
      ...createStructureOperation(type, id),
      name: `${getOperationDefaultName(type)} ${nextOperationNumber}`,
    },
    nextOperationNumber: nextOperationNumber + 1,
  };
};

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
   * What a left-drag on the canvas does: put dominoes down, or draw a rectangle
   * over the ones already there. One of the two is always chosen.
   *
   * See structureToolCommands.ts for why this exists at all — the first release
   * of this screen deliberately had no tool, and a rubber band wanting the left
   * button is what changed that.
   */
  tool: StructureTool;
  setTool: (tool: StructureTool) => void;

  /**
   * Which way up the next domino placed will be. Not a tool: it says how a
   * placement goes down rather than whether the canvas is placing at all, which
   * is why it is chosen at the same time as one. The three choices work as a set
   * of radio buttons, so one of them is always chosen.
   *
   * View and tool state, in the same class as showAllLayers — it records no
   * history and is not part of the structure's description.
   */
  dominoOrientation: DominoOrientation;
  setDominoOrientation: (orientation: DominoOrientation) => void;

  /**
   * Whether the pointer is over the canvas.
   *
   * The keys that move the layer and the keys that lay dominoes both only act
   * while it is, so that they cannot fire at whatever the user happens to be
   * doing elsewhere on the screen. It is here rather than a ref in one component
   * because the two halves are handled in different places — the layer keys
   * outside the canvas, the arrow keys inside it — and one flag read from both
   * beats two that can disagree.
   */
  pointerOverCanvas: boolean;
  setPointerOverCanvas: (over: boolean) => void;

  /**
   * Which dominoes are selected, as positions in the group's own list.
   *
   * View state: it records no history, and it is cleared by anything that
   * renumbers the list — undo, redo, and a delete. Placement does not clear it,
   * because a placement appends and shifts nothing.
   *
   * **Positions rather than ids on the dominoes themselves.** A selection lasts
   * until the next click, where an id would be a field on the shape written out
   * as JSON — machinery in the document to serve something that never leaves the
   * screen. The day something needs a selection that survives a structural
   * change, that is when an id earns its place.
   */
  selectedDominoes: ReadonlySet<number>;
  /** Replace the selection, or add to it when `additive` is set. */
  selectDominoes: (indices: Iterable<number>, additive?: boolean) => void;
  clearDominoSelection: () => void;
  /** Remove every selected domino, recording one undo entry for the lot. */
  deleteSelectedDominoes: () => void;

  /**
   * Whether to leave out the dominoes standing on layers above the one being
   * worked on.
   *
   * A separate toggle from showAllLayers rather than part of it, because they
   * answer different questions: that one is about how many *sheets* to draw, and
   * a structure's dominoes are the structure itself, so hiding them along with
   * the sheets would make the screen show less than it knows. This exists for
   * the one case where they get in the way — working straight down on a course
   * with several more built above it.
   */
  hideDominoesAbove: boolean;
  toggleHideDominoesAbove: () => void;

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

  /**
   * Add one domino to the structure's group, making the group first if this is
   * the first domino. Records one undo entry either way.
   */
  placeDomino: (domino: PlacedDomino) => void;

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

  // Placing to begin with, which is what most of a session is spent doing and
  // what the screen did before there were tools at all.
  tool: "createDominoes",
  setTool: (tool) => set({ tool }),

  // Sideways to begin with — a domino lying on a long narrow edge is by far the
  // commonest piece in a structure.
  dominoOrientation: "sideways",
  setDominoOrientation: (dominoOrientation) => set({ dominoOrientation }),

  pointerOverCanvas: false,
  setPointerOverCanvas: (pointerOverCanvas) => set({ pointerOverCanvas }),

  selectedDominoes: new Set<number>(),

  selectDominoes: (indices, additive = false) =>
    set((s) => ({
      selectedDominoes: additive
        ? new Set([...s.selectedDominoes, ...indices])
        : new Set(indices),
    })),

  clearDominoSelection: () => set({ selectedDominoes: new Set<number>() }),

  deleteSelectedDominoes: () =>
    set((s) => {
      const group = effectiveDominoGroup(s.operations);
      if (!group || s.selectedDominoes.size === 0) return {};

      // Ascending, which is the order the undo edit has to hold them in so that
      // putting them back is a plain loop — see StructureUndoEdit.
      const removed = [...s.selectedDominoes]
        .filter((index) => index >= 0 && index < group.dominoes.length)
        .sort((a, b) => a - b)
        .map((index) => ({ index, domino: group.dominoes[index] }));
      if (removed.length === 0) return { selectedDominoes: new Set<number>() };

      // The group is left standing even when it ends up empty. Taking it away as
      // well would be a second change nobody asked for on one press of a key, and
      // its own Delete is one menu away.
      return {
        operations: dominoesRemovedAt(
          s.operations,
          group.id,
          new Set(removed.map((entry) => entry.index)),
        ),
        selectedDominoes: new Set<number>(),
        ...pushUndoEdit(s.undoStack, {
          kind: "dominoesRemoved",
          groupId: group.id,
          removed,
        }),
      };
    }),

  hideDominoesAbove: false,
  toggleHideDominoesAbove: () =>
    set((s) => ({ hideDominoesAbove: !s.hideDominoesAbove })),

  operations: [],
  nextOperationNumber: 1,

  modifyingOperationId: null,
  creatingOperationId: null,
  modifyingSnapshot: null,

  createOperation: (type) =>
    set((s) => {
      const { operation, nextOperationNumber } = mintOperation(
        s.nextOperationNumber,
        type,
      );
      const id = operation.id;

      return {
        nextOperationNumber,
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

  placeDomino: (domino) =>
    set((s) => {
      const group = effectiveDominoGroup(s.operations);

      // The first domino brings the group into being with it, as one undo
      // entry rather than two. An empty group is not a state anybody chose, so
      // undoing that first placement takes the whole group away — which is also
      // why this cannot go through createOperation: that one opens the
      // properties dialog, and a group appears without one.
      if (!group) {
        const minted = mintOperation(s.nextOperationNumber, "dominoGroup");
        // createStructureOperation hands back the whole union of operation
        // shapes, so this narrows it to what was asked for. It cannot fail.
        if (minted.operation.type !== "dominoGroup") return {};
        const created: DominoGroupOperation = {
          ...minted.operation,
          dominoes: [domino],
        };
        const index = s.operations.length;
        return {
          nextOperationNumber: minted.nextOperationNumber,
          operations: [...s.operations, created],
          ...pushUndoEdit(s.undoStack, {
            kind: "create",
            operation: created,
            index,
          }),
        };
      }

      // Every placement after that records the one domino and where it went,
      // rather than a before-and-after pair of the whole group. See
      // StructureUndoEdit: at the sizes a real structure reaches, a pair of
      // snapshots per placement is megabytes of stack for edits that each touched
      // a single piece.
      const at = group.dominoes.length;
      return {
        operations: dominoesInserted(s.operations, group.id, at, [domino]),
        ...pushUndoEdit(s.undoStack, {
          kind: "dominoesAdded",
          groupId: group.id,
          at,
          dominoes: [domino],
        }),
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
    // Cleared rather than carried across. A selection is a set of positions in
    // the group's list, and an edit being applied may well have moved them; the
    // one thing worse than losing a selection is keeping one that now points at
    // different dominoes.
    set({ selectedDominoes: new Set<number>() });

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
      case "dominoesAdded":
        set({
          operations: dominoesRemovedAt(
            s.operations,
            edit.groupId,
            new Set(edit.dominoes.map((_, i) => edit.at + i)),
          ),
          undoStack,
          redoStack,
        });
        break;
      case "dominoesRemoved":
        set({
          operations: dominoesRestored(s.operations, edit.groupId, edit.removed),
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
    // Cleared for the reason undo's is; see there.
    set({ selectedDominoes: new Set<number>() });

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
      case "dominoesAdded":
        set({
          operations: dominoesInserted(
            s.operations,
            edit.groupId,
            edit.at,
            edit.dominoes,
          ),
          undoStack,
          redoStack,
        });
        break;
      case "dominoesRemoved":
        set({
          operations: dominoesRemovedAt(
            s.operations,
            edit.groupId,
            new Set(edit.removed.map((entry) => entry.index)),
          ),
          undoStack,
          redoStack,
        });
        break;
    }
  },
}));