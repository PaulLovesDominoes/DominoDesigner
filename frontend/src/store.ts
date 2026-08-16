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
import {
  createPaintBrushSlice,
  type PaintBrushSlice,
} from "./paint-brush/appStoreSlice";
import {
  createImageMapSlice,
  type ImageMapSlice,
} from "./image-map/appStoreSlice";
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
    ShapeSelectSlice,
    PaintBrushSlice,
    ImageMapSlice {
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
  /**
   * Switch tools. It deliberately cannot arm "newElement": that tool means
   * nothing without an element type alongside it, so startNewElement below is
   * its only way in, and excluding it here is what keeps "placing, but with
   * nothing to place" from being representable at all. ("editDominoes" is
   * likewise only entered through enterDominoEditing, which sets activeTool
   * itself rather than going through this.)
   */
  setTool: (tool: Exclude<ToolId, "newElement">) => void;

  /**
   * Which DDObject type the "newElement" tool is about to place, and null
   * whenever any other tool is active — an invariant every write below
   * maintains, so a reader can treat a non-null value as live.
   *
   * This is what used to be said by a per-type ToolId ("field"). Holding it
   * here instead means registering a placeable type adds no ToolId member and
   * no per-type comparison anywhere; see designer/toolConfig.ts's
   * PLACEMENT_TOOLS.
   */
  newElementType: DDObjectType | null;
  /** Arm placement of `type` — the only way into the "newElement" tool. */
  startNewElement: (type: DDObjectType) => void;

  // The DDObject the user has selected for direct manipulation on the canvas /
  // in the hierarchy (null = nothing selected). Distinct from `activeTool`,
  // which is the drawing tool. The root BuildPlane is never selectable.
  selectedDDObjectId: DDObjectId | null;
  selectDDObject: (id: DDObjectId | null) => void;

  // Which DDObject's dominoes are being edited on the canvas (null = not in
  // domino editing mode). The mode is fully modal — activeTool becomes
  // "editDominoes", which is enough on its own to disarm SelectionTool,
  // CreateByRegionTool and DesignerCanvas's onPointerMissed (none of them match
  // "select" or "newElement" anymore); Toolbar/Sidebar disable
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

  // The selected swatch, the shortcut buffer and the four colour writes come
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
  setTool: (activeTool) => set({ activeTool, newElementType: null }),

  newElementType: null,
  startNewElement: (newElementType) => set({ activeTool: "newElement", newElementType }),

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
      // Reachable while placement is armed — the sidebar row's double-click
      // works whatever tool is active — so this keeps newElementType's "null
      // unless the tool is newElement" invariant.
      newElementType: null,
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
  exitDominoEditing: () => {
    // Before the set, because it has to see dominoEditingId still set: a mapping
    // run left going would keep recolouring a field nobody is editing, and would
    // then push its undo entry after the mode's barrier had already been
    // cleared. Cancelling puts back whatever it had painted so far.
    get().cancelColorMapping();
    set((s) => {
      if (s.dominoEditingId) {
        useDominoSelectionStore.getState().clear(s.dominoEditingId);
        // The brush hover has to be cleared here explicitly, and cannot be left
        // to DominoEditor's resetBrushView effect: this update nulls
        // dominoBrushId and dominoEditingId together, so by the time that effect
        // runs it has no id to clear under and the hover would be stranded —
        // white boxes left over a field nobody is editing any more.
        useDominoSelectionStore.getState().clearBrushHover(s.dominoEditingId);
      }
      // Note the color clipboard is deliberately NOT cleared alongside the
      // selected swatch and shortcut buffer below: it holds a snapshot of its
      // source element, so it stays valid after leaving the mode and lets a
      // pattern copied in one field be pasted into another. Only the handlers
      // unregister (that's DominoEditor's doing), not the buffer.
      return {
        // Every image operation is dropped from the history, and they are gone
        // for good.
        //
        // A picture is only ever on screen inside this mode, so an image
        // operation surviving past it could only ever be undone invisibly —
        // Ctrl+Z would appear to do nothing at all. That is the rule these
        // operations are held to (see the "imageMap" cases in
        // history/appStoreSlice.ts, which enforce the same thing from the other
        // side), and outside the mode it cannot be met.
        //
        // Pulling entries out of the middle of the stacks is safe because an
        // image operation touches nothing but `imageMaps`, which no other kind
        // reads — so what is left still replays in order. It is also what lets
        // assetStore.ts's pruner free the megabytes held by every picture
        // deleted or replaced during the session: that memory is kept alive
        // *by* these entries, and only by them.
        //
        // dominoEditingUndoBarrier cannot be one of the entries removed here: it
        // is captured on entry, and this purge means no image operation is ever
        // on the stack at that moment. It is cleared below in any case.
        undoStack: s.undoStack.filter((op) => op.kind !== "imageMap"),
        redoStack: s.redoStack.filter((op) => op.kind !== "imageMap"),
        dominoEditingId: null,
        selectedDDObjectId: s.dominoEditingId,
        activeTool: "select" as ToolId,
        dominoEditingUndoBarrier: null,
        // The one place the selected swatch is cleared. Nothing inside the mode
        // does — not Escape, not picking up a brush — so a colour chosen once
        // lasts the whole session.
        dominoSelectedSwatchId: null,
        dominoColorShortcut: "",
        // A keyboard pick's pressed-button flash normally un-presses itself on a
        // timer, but DominoEditor's keydown effect clears that timer when it
        // tears down — which is exactly now. Leaving the mode inside the flash
        // window would otherwise strand a swatch looking held down for good.
        dominoPressedSwatchId: null,
        dominoEditingColorSnapshot: null,
        // The Expand toggle is a view aid scoped to the mode, so leaving it
        // restores the dominoes' real size — no separate teardown needed.
        dominoExpanded: false,
        // Same reasoning for the armed shape-select gesture: it only means
        // anything inside the mode, so leaving returns the next visit to the
        // default rectangle rubber band.
        dominoShapeSelectId: null,
        dominoShapeSelectHint: null,
        // And for an armed paint brush. Its *size* deliberately survives, in
        // dominoBrushSizes — that is a preference the user set once, not
        // per-session state. dominoStroke should already be null (a stroke ends
        // on pointerup, and Done is a button click), but clearing it here means
        // no half-finished stroke can outlive the mode it belongs to.
        dominoBrushId: null,
        dominoStroke: null,
        // And for the two image sub-modes. The picture itself deliberately
        // survives, in imageMaps — Done keeps it, so re-entering the mode shows
        // it exactly where it was left. Only Cancel throws it away (see below).
        imageMapActive: false,
        imageTransformActive: false,
        imageMapMessage: null,
        imageMapEntryWarning: "none" as const,
      };
    });
  },

  cancelDominoEditing: () => {
    // Put the colours back from the entry snapshot rather than replaying the
    // undo stack backwards. Replaying cannot be exact: HISTORY_LIMIT drops
    // entries off the front, so past that many in-mode edits the earliest ones
    // no longer exist to be undone and the field comes back partly painted.
    // See the snapshot's declaration in dominoes/appStoreSlice.ts.
    get().restoreDominoColorSnapshot();

    const s = get();
    // The picture goes too, along with the set of dominoes it was allowed to
    // fill. Cancel means "put this element back the way it was when I started",
    // and a picture the user placed during the session is part of what they are
    // taking back — unlike Done, which keeps it so re-entering finds it where it
    // was left.
    if (s.dominoEditingId) s.discardImageMapSession(s.dominoEditingId);

    // Drop the in-mode entries from the history: they describe changes that no
    // longer happened. Everything after the barrier is in-mode work — and
    // lastIndexOf returns -1 exactly when the barrier has aged off the front,
    // in which case every surviving entry is in-mode work and the whole stack
    // goes, which is the same reasoning that makes the undo clamp lapse safely.
    //
    // Throwing the entries away rather than inverting them is sound because
    // everything they could describe has already been put back by hand: the
    // colours by restoreDominoColorSnapshot above, and the picture by
    // discardImageMapSession. Those two are the only things the mode can change,
    // which is what enterDominoEditing's redoStack reset secures — without it a
    // Ctrl+Y could have replayed pre-mode work into the mode, and that *would*
    // be dropped here without being undone.
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
        ...(s.creatingDDObjectId
          ? { activeTool: "select" as ToolId, newElementType: null }
          : {}),
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
          newElementType: null,
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
  ...createPaintBrushSlice(set, get, api),
  ...createImageMapSlice(set, get, api),
}));