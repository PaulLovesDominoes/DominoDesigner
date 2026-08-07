import { create } from "zustand";

import type { CameraApi, ScreenId, ToolId } from "./types";
import {
  createDDObject,
  isDominoEditable,
  type DDObject,
  type DDObjectType,
} from "./object-types/registry";
import type { DDObjectId } from "./object-types/base";
import type { BuildPlaneDDObject } from "./object-types/buildPlane/object-model";
import { useDominoSelectionStore } from "./dominoes/selectionStore";
import {
  createDominoColorSlice,
  type DominoColorSlice,
} from "./dominoes/appStoreSlice";
import {
  createInventorySlice,
  type InventorySlice,
} from "./domino-inventory/appStoreSlice";
import {
  createHistorySlice,
  operationReferencesId,
  pushOperation,
  type HistorySlice,
} from "./history/appStoreSlice";
import {
  createShapeSelectSlice,
  type ShapeSelectSlice,
} from "./shape-select/appStoreSlice";
import { applyRemoveDDObject, ddObjectsEqual } from "./ddObjectOps";

/**
 * Seed a fresh project's DDObject hierarchy: a single root BuildPlane (DDO-1)
 * with no children. This is the "new project" initialization seam.
 */
function createInitialDDObjects() {
  const root = createDDObject("buildPlane", "DDO-1");
  return {
    ddObjects: { [root.id]: root } as Record<DDObjectId, DDObject>,
    rootId: root.id,
    nextDDObjectNumber: 2,
  };
}

/**
 * Whether `id` is referenced by any operation still on the undo or redo
 * stack — i.e., whether some future undo/redo could still bring a deleted
 * DDObject back (a "delete" op whose subtree includes it), independent of
 * whether `id` is currently present in `ddObjects`. Used by
 * dominoes/store.ts and dominoes/colorMemory.ts to defer pruning a deleted
 * DDObject's domino data/color memory until it's truly unreachable, rather
 * than the instant it leaves `ddObjects` — otherwise undoing a delete would
 * reinsert the DDObject but its dominoes would already have been garbage
 * collected, coming back all default-grey with no memory of their colors.
 *
 * Lives here rather than alongside the rest of history because it is a query
 * against the *live store*, and keeping the one `useStore`-touching part of
 * history in store.ts is what leaves history/appStoreSlice.ts with no value
 * import from this module. The per-operation predicate it runs is history's,
 * and is imported.
 */
export function isDDObjectInUndoHistory(id: DDObjectId): boolean {
  const { undoStack, redoStack } = useStore.getState();
  return (
    undoStack.some((op) => operationReferencesId(op, id)) ||
    redoStack.some((op) => operationReferencesId(op, id))
  );
}

/**
 * The app store's state. Exported because slice modules type their own
 * StateCreator against it — see domino-inventory/appStoreSlice.ts, which holds
 * the inventory members that used to sit at the bottom of this interface.
 */
export interface AppState
  extends InventorySlice,
    HistorySlice,
    DominoColorSlice,
    ShapeSelectSlice {
  // Which screen is showing.
  screen: ScreenId;
  setScreen: (screen: ScreenId) => void;

  // Hamburger menu open/closed.
  menuOpen: boolean;
  toggleMenu: () => void;
  closeMenu: () => void;

  // Help panel open/closed.
  helpOpen: boolean;
  toggleHelp: () => void;
  closeHelp: () => void;
  // Pins the next help-panel open to a specific topic id instead of the
  // screen's default (see help/registry.ts's topicForScreen). Cleared whenever
  // the panel closes, so a later generic help-open isn't left pinned.
  helpTopicOverride: string | null;
  openHelpTopic: (id: string) => void;

  // Currently selected designer tool (single-select). "editDominoes" has no
  // toolbar entry — see enterDominoEditing.
  activeTool: ToolId;
  setTool: (tool: ToolId) => void;

  // The DDObject the user has selected for direct manipulation on the canvas /
  // in the hierarchy (null = nothing selected). Distinct from `activeTool`,
  // which is the drawing tool. The root BuildPlane is never selectable.
  selectedDDObjectId: DDObjectId | null;
  selectDDObject: (id: DDObjectId | null) => void;

  // Which DDObject's dominoes are being edited on the canvas (null = not in
  // domino editing mode). The mode is fully modal — activeTool becomes
  // "editDominoes", which is enough on its own to disarm SelectionTool,
  // CreateByRegionTool and DesignerCanvas's onPointerMissed (none of them match
  // "select" or an elementType-bearing tool anymore); Toolbar/Sidebar disable
  // the rest of the UI by reading activeTool directly. The two actions below are
  // the only ways out, wired to ModeHintBar's Done and Cancel respectively.
  dominoEditingId: DDObjectId | null;
  enterDominoEditing: (id: DDObjectId) => void;
  /** Keep the edits made in the mode; just leave. */
  exitDominoEditing: () => void;
  /**
   * Discard everything done inside the mode — rolling the undo stack back to
   * the state at entry — and leave. The confirmation prompt is ModeHintBar's
   * (it also decides whether there is anything to discard at all).
   */
  cancelDominoEditing: () => void;

  // enterDominoEditing/exitDominoEditing also maintain the undo clamp
  // (`dominoEditingUndoBarrier`, declared in history/appStoreSlice.ts alongside
  // the undo() that enforces it); cancelDominoEditing drains back to it.

  // The domino colour lock, shortcut buffer and the four colour writes come
  // from DominoColorSlice (dominoes/appStoreSlice.ts).

  // The build's DDObject hierarchy, indexed by DDObject id. `rootId` is the
  // BuildPlane; each DDObject with children lists their ids in `children`.
  ddObjects: Record<DDObjectId, DDObject>;
  rootId: DDObjectId;
  // Next counter value for minting "DDO-#" ids.
  nextDDObjectNumber: number;
  // Mint a DDObject of `type` under the root, apply `patch`, and open its
  // properties in creating mode. Registry-driven, so any element tool uses it
  // unchanged — the store stays free of per-type creation logic.
  createElement: (type: DDObjectType, patch: Partial<DDObject>) => void;
  // The single write path for property editors: shallow-merge into a DDObject.
  updateDDObject: (id: DDObjectId, patch: Partial<DDObject>) => void;
  // Delete a DDObject and its descendants. The root plane cannot be deleted.
  removeDDObject: (id: DDObjectId) => void;

  // undoStack/redoStack/undo/redo/recordTransform come from HistorySlice.

  // DDObject whose properties dialog is open (null = closed); one at a time.
  editingDDObjectId: DDObjectId | null;
  // Set when the open dialog is a *creation* rather than an edit. Cancelling a
  // creation deletes the DDObject outright; cancelling an edit rolls it back.
  creatingDDObjectId: DDObjectId | null;
  // Values as of the moment the dialog opened. Edits are written straight into
  // `ddObjects` so the canvas previews them live, so this is the only record of
  // what to put back if the user cancels.
  editingSnapshot: DDObject | null;
  openProperties: (id: DDObjectId) => void;
  /** Keep the edited values; just close. */
  saveProperties: () => void;
  /** Put the snapshot back — reverting the canvas too — then close. */
  cancelProperties: () => void;

  // Imperative camera bridge, registered by CameraRig inside the <Canvas>.
  cameraApi: CameraApi | null;
  setCameraApi: (cameraApi: CameraApi | null) => void;
}

export const useStore = create<AppState>()((set, get, api) => ({
  screen: "designer",
  setScreen: (screen) => set({ screen }),

  menuOpen: false,
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  closeMenu: () => set({ menuOpen: false }),

  helpOpen: false,
  toggleHelp: () =>
    set((s) => {
      const helpOpen = !s.helpOpen;
      return { helpOpen, ...(helpOpen ? {} : { helpTopicOverride: null }) };
    }),
  closeHelp: () => set({ helpOpen: false, helpTopicOverride: null }),
  helpTopicOverride: null,
  openHelpTopic: (id) => set({ helpOpen: true, helpTopicOverride: id }),

  activeTool: "select",
  setTool: (activeTool) => set({ activeTool }),

  selectedDDObjectId: null,
  selectDDObject: (selectedDDObjectId) => set({ selectedDDObjectId }),

  dominoEditingId: null,
  // dominoEditingUndoBarrier's initial value comes from HistorySlice; the two
  // actions below are its only writers.
  enterDominoEditing: (id) => {
    const s = get();
    const ddObject = s.ddObjects[id];
    if (!ddObject || !isDominoEditable(ddObject)) return;
    // Everything Cancel has to put back, captured before anything can change it.
    s.captureDominoColorSnapshot(id);
    set({
      dominoEditingId: id,
      selectedDDObjectId: id,
      activeTool: "editDominoes" as ToolId,
      // Undefined on an empty stack, normalised to null = no clamp needed.
      dominoEditingUndoBarrier: s.undoStack[s.undoStack.length - 1] ?? null,
      // Closes the mode's history: undo is clamped at the barrier, but redo
      // deliberately isn't, so a leftover pre-mode redoStack would let Ctrl+Y
      // replay pre-mode work *into* the mode — which cancelDominoEditing would
      // then discard from the stack without reverting. Dropping it here also
      // costs nothing, since the first in-mode edit's pushOperation clears the
      // redo stack anyway; this only brings that forward.
      redoStack: [],
    });
    // Fit the field to the canvas: a mode whose whole purpose is per-domino
    // work is unusable at build-plane zoom. Imperative, so it sits outside the
    // set() rather than in an updater. Optional-chained because CameraRig
    // registers the api from inside the <Canvas> — a call before that mounts is
    // a harmless no-op.
    s.cameraApi?.frameDDObject(id);
  },
  exitDominoEditing: () =>
    set((s) => {
      if (s.dominoEditingId) useDominoSelectionStore.getState().clear(s.dominoEditingId);
      // Note the color clipboard is deliberately NOT cleared alongside the lock
      // and shortcut buffer below: it holds a snapshot of its source element, so
      // it stays valid after leaving the mode and lets a pattern copied in one
      // field be pasted into another. Only the handlers unregister (that's
      // DominoEditTool's doing), not the buffer.
      return {
        dominoEditingId: null,
        selectedDDObjectId: s.dominoEditingId,
        activeTool: "select" as ToolId,
        dominoEditingUndoBarrier: null,
        dominoColorLockedId: null,
        dominoColorShortcut: "",
        dominoEditingColorSnapshot: null,
        // The Expand toggle is a view aid scoped to the mode, so leaving it
        // restores the dominoes' real size — no separate teardown needed.
        dominoExpanded: false,
        // Same reasoning for the armed shape-select gesture: it only means
        // anything inside the mode, so leaving returns the next visit to the
        // default rectangle rubber band.
        dominoShapeSelectId: null,
        dominoShapeSelectHint: null,
      };
    }),
  cancelDominoEditing: () => {
    // Put the colours back from the entry snapshot rather than replaying the
    // undo stack backwards. Replaying cannot be exact: HISTORY_LIMIT drops
    // entries off the front, so past that many in-mode edits the earliest ones
    // no longer exist to be undone and the field comes back partly painted.
    // See the snapshot's declaration in dominoes/appStoreSlice.ts.
    get().restoreDominoColorSnapshot();

    const s = get();
    // Drop the in-mode entries from the history: they describe changes that no
    // longer happened. Everything after the barrier is in-mode work — and
    // lastIndexOf returns -1 exactly when the barrier has aged off the front,
    // in which case every surviving entry is in-mode work and the whole stack
    // goes, which is the same reasoning that makes the undo clamp lapse safely.
    // Truncating is sound only because in-mode operations are colour changes and
    // nothing else, which is what enterDominoEditing's redoStack reset secures.
    const keep = s.dominoEditingUndoBarrier
      ? s.undoStack.lastIndexOf(s.dominoEditingUndoBarrier) + 1
      : 0;
    set({
      undoStack: s.undoStack.slice(0, keep),
      // Nothing in here survived the cancel either — it can only hold in-mode
      // operations, again per enterDominoEditing's reset.
      redoStack: [],
    });
    get().exitDominoEditing();
  },

  ...createInitialDDObjects(),
  createElement: (type, patch) =>
    set((s) => {
      const id = `DDO-${s.nextDDObjectNumber}`;
      const element = { ...createDDObject(type, id), ...patch } as DDObject;
      const root = s.ddObjects[s.rootId] as BuildPlaneDDObject;
      return {
        nextDDObjectNumber: s.nextDDObjectNumber + 1,
        ddObjects: {
          ...s.ddObjects,
          [id]: element,
          [root.id]: { ...root, children: [...root.children, id] },
        },
        // Open the dialog straight away, flagged as a creation so Cancel
        // discards the DDObject rather than rolling its properties back.
        editingDDObjectId: id,
        editingSnapshot: element,
        creatingDDObjectId: id,
        // A fresh creation shouldn't leave a previous selection highlighted.
        selectedDDObjectId: null,
      };
    }),

  updateDDObject: (id, patch) =>
    set((s) => {
      const ddObject = s.ddObjects[id];
      if (!ddObject) return {};
      return {
        ddObjects: { ...s.ddObjects, [id]: { ...ddObject, ...patch } as DDObject },
      };
    }),

  removeDDObject: (id) =>
    set((s) => {
      const result = applyRemoveDDObject(
        s.ddObjects,
        s.rootId,
        s.editingDDObjectId,
        s.selectedDDObjectId,
        s.dominoEditingId,
        id,
      );
      // The build plane is the hierarchy's root; there is nowhere to put its
      // children, so it is undeletable (the row menu greys the entry out too).
      // undefined also covers an id that's already gone — nothing to record.
      if (!result) return {};
      return {
        ...result.patch,
        ...pushOperation(s.undoStack, {
          kind: "delete",
          subtree: result.subtree,
          parentId: result.parentId,
          index: result.index,
        }),
      };
    }),


  editingDDObjectId: null,
  editingSnapshot: null,
  creatingDDObjectId: null,
  openProperties: (id) =>
    set((s) => ({ editingDDObjectId: id, editingSnapshot: s.ddObjects[id] ?? null })),
  saveProperties: () =>
    set((s) => {
      const base = {
        editingDDObjectId: null,
        editingSnapshot: null,
        creatingDDObjectId: null,
        // Finishing a creation ends the tool's placement mode. A plain edit
        // leaves whatever tool is active alone.
        ...(s.creatingDDObjectId ? { activeTool: "select" as ToolId } : {}),
      };

      // A creation's "before" state is "didn't exist" — always record, and
      // record the whole final object rather than each edit made while the
      // dialog was open (Cancel would have discarded them all anyway).
      if (s.creatingDDObjectId) {
        const ddObject = s.ddObjects[s.creatingDDObjectId];
        if (!ddObject) return base;
        return {
          ...base,
          ...pushOperation(s.undoStack, { kind: "create", ddObject, parentId: s.rootId }),
        };
      }

      // A plain edit: diff the pre-dialog snapshot against the live object.
      // Equal means nothing actually changed — Save-with-no-edits records nothing.
      if (s.editingDDObjectId && s.editingSnapshot) {
        const live = s.ddObjects[s.editingDDObjectId];
        if (live && !ddObjectsEqual(s.editingSnapshot, live)) {
          return {
            ...base,
            ...pushOperation(s.undoStack, {
              kind: "properties",
              before: s.editingSnapshot,
              after: live,
            }),
          };
        }
      }

      return base;
    }),
  cancelProperties: () => {
    const creatingId = get().creatingDDObjectId;

    // Cancelling a creation discards the DDObject outright — it was never
    // saved, so no `create` was ever pushed either. This must go through the
    // raw removal helper, not the public removeDDObject, or it would push a
    // dangling `delete` with nothing to pair against — Undo would then
    // resurrect an object the user explicitly discarded.
    if (creatingId) {
      set((s) => {
        const result = applyRemoveDDObject(
          s.ddObjects,
          s.rootId,
          s.editingDDObjectId,
          s.selectedDDObjectId,
          s.dominoEditingId,
          creatingId,
        );
        return {
          ...(result?.patch ?? {}),
          creatingDDObjectId: null,
          activeTool: "select" as ToolId,
        };
      });
      return;
    }

    set((s) => {
      const snapshot = s.editingSnapshot;
      if (!snapshot) return { editingDDObjectId: null, editingSnapshot: null };

      const live = s.ddObjects[snapshot.id];
      // The DDObject may have been deleted, or gained/lost children, while the
      // dialog was open. Roll back the edited properties only — never the
      // hierarchy.
      const restored =
        live && "children" in live && "children" in snapshot
          ? { ...snapshot, children: live.children }
          : snapshot;

      return {
        ddObjects: live
          ? { ...s.ddObjects, [snapshot.id]: restored as DDObject }
          : s.ddObjects,
        editingDDObjectId: null,
        editingSnapshot: null,
      };
    });
  },

  cameraApi: null,
  setCameraApi: (cameraApi) => set({ cameraApi }),

  // Slices are spread in alongside the members still declared inline above.
  // They receive the same (set, get, api) triple create() hands this
  // initializer, so a slice's `set`/`get` see the whole AppState, not just
  // their own members.
  ...createInventorySlice(set, get, api),
  ...createHistorySlice(set, get, api),
  ...createDominoColorSlice(set, get, api),
  ...createShapeSelectSlice(set, get, api),
}));