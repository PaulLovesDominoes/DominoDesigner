import { create } from "zustand";

import type { CameraApi, ScreenId, ToolId } from "./types";
import {
  createDDObject,
  type DDObject,
  type DDObjectType,
} from "./object-types/registry";
import type { DDObjectId } from "./object-types/base";
import type { BuildPlaneDDObject } from "./object-types/buildPlane/object-model";

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

/** Ids of `id` and everything beneath it, for a recursive delete. */
function collectSubtree(
  ddObjects: Record<DDObjectId, DDObject>,
  id: DDObjectId,
  into: Set<DDObjectId> = new Set(),
) {
  into.add(id);
  const ddObject = ddObjects[id];
  if (ddObject && "children" in ddObject) {
    for (const childId of ddObject.children) collectSubtree(ddObjects, childId, into);
  }
  return into;
}

/**
 * One undoable action. Whole-DDObject snapshots throughout (never per-field
 * patches) — fieldElement's normalizeSize coupling makes fields too
 * interdependent to diff/reapply piecemeal. A future domino-level operation
 * kind can join this union without restructuring the stack around it.
 */
type Operation =
  | { kind: "create"; ddObject: DDObject; parentId: DDObjectId }
  | { kind: "delete"; subtree: DDObject[]; parentId: DDObjectId; index: number }
  | { kind: "transform"; before: DDObject; after: DDObject }
  | { kind: "properties"; before: DDObject; after: DDObject };

// Undo entries are capped so a long session can't grow the stack unbounded.
const HISTORY_LIMIT = 100;

/** Push a new operation and clear the redo stack, per standard undo/redo semantics. */
function pushOperation(undoStack: Operation[], op: Operation) {
  return { undoStack: [...undoStack, op].slice(-HISTORY_LIMIT), redoStack: [] as Operation[] };
}

// DDObjects are plain JSON-safe data, so whole-object equality is cheap. This
// only ever runs at a commit point (dialog Save, drag pointer-up) — never per
// keystroke/frame — so a no-op session (nothing actually changed) pushes nothing.
function ddObjectsEqual(a: DDObject, b: DDObject): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface RemovalResult {
  // Nested (rather than flattened with subtree/parentId/index alongside it) so
  // call sites can spread `result.patch` straight into a store update without
  // ever destructuring-to-discard the bookkeeping fields.
  patch: {
    ddObjects: Record<DDObjectId, DDObject>;
    editingDDObjectId?: null;
    editingSnapshot?: null;
    creatingDDObjectId?: null;
    selectedDDObjectId?: null;
  };
  subtree: DDObject[];
  parentId: DDObjectId;
  index: number;
}

/**
 * Pure computation of removing `id` and its subtree: the doomed DDObjects (so
 * undo can restore them), the parent `id` sat in and its index there (so undo
 * reinserts at the same spot instead of appending), and the resulting
 * ddObjects/editing/selection patch. Returns undefined if `id` is the root or
 * already gone.
 *
 * This is the raw half of removeDDObject, shared with undo/redo. Applying
 * history must never itself record a new operation — the public removeDDObject
 * action below calls this and additionally pushes a `delete` entry; undo/redo
 * call this directly and never push anything from it, which is what keeps
 * inverting a `create` (a raw removal) from being mistaken for a user-initiated
 * delete.
 */
function applyRemoveDDObject(
  ddObjects: Record<DDObjectId, DDObject>,
  rootId: DDObjectId,
  editingDDObjectId: DDObjectId | null,
  selectedDDObjectId: DDObjectId | null,
  id: DDObjectId,
): RemovalResult | undefined {
  if (id === rootId || !ddObjects[id]) return undefined;

  const doomedSet = collectSubtree(ddObjects, id);
  const subtree = Array.from(doomedSet).map((did) => ddObjects[did]);

  // The external parent is whichever surviving object lists `id` as a child.
  let parentId: DDObjectId = rootId;
  let index = 0;
  for (const ddObject of Object.values(ddObjects)) {
    if (doomedSet.has(ddObject.id)) continue;
    if ("children" in ddObject && ddObject.children.includes(id)) {
      parentId = ddObject.id;
      index = ddObject.children.indexOf(id);
      break;
    }
  }

  const nextDDObjects: Record<DDObjectId, DDObject> = {};
  for (const [key, ddObject] of Object.entries(ddObjects)) {
    if (doomedSet.has(key)) continue;
    nextDDObjects[key] =
      "children" in ddObject && ddObject.children.includes(id)
        ? { ...ddObject, children: ddObject.children.filter((c) => c !== id) }
        : ddObject;
  }

  const editingDeleted = editingDDObjectId !== null && doomedSet.has(editingDDObjectId);
  const selectionDeleted = selectedDDObjectId !== null && doomedSet.has(selectedDDObjectId);

  return {
    patch: {
      ddObjects: nextDDObjects,
      ...(editingDeleted && {
        editingDDObjectId: null,
        editingSnapshot: null,
        creatingDDObjectId: null,
      }),
      ...(selectionDeleted && { selectedDDObjectId: null }),
    },
    subtree,
    parentId,
    index,
  };
}

/**
 * Inverse of applyRemoveDDObject: reinsert `objects` (subtree[0] is the one the
 * caller cares about) under `parentId`, at `index` if given or appended
 * otherwise. Create's redo always appends (createElement only ever appends);
 * delete's undo passes the original index so a deleted sibling reappears in the
 * middle of a list rather than jumping to the end.
 */
function applyInsertDDObjects(
  ddObjects: Record<DDObjectId, DDObject>,
  objects: DDObject[],
  parentId: DDObjectId,
  index?: number,
): Record<DDObjectId, DDObject> {
  const parent = ddObjects[parentId];
  if (!parent || !("children" in parent) || objects.length === 0) return ddObjects;

  const children = [...parent.children];
  if (index === undefined) children.push(objects[0].id);
  else children.splice(index, 0, objects[0].id);

  const next: Record<DDObjectId, DDObject> = {
    ...ddObjects,
    [parentId]: { ...parent, children },
  };
  for (const ddObject of objects) next[ddObject.id] = ddObject;
  return next;
}

interface AppState {
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

  // Currently selected designer tool (single-select).
  activeTool: ToolId;
  setTool: (tool: ToolId) => void;

  // The DDObject the user has selected for direct manipulation on the canvas /
  // in the hierarchy (null = nothing selected). Distinct from `activeTool`,
  // which is the drawing tool. The root BuildPlane is never selectable.
  selectedDDObjectId: DDObjectId | null;
  selectDDObject: (id: DDObjectId | null) => void;

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

  // Unified undo/redo history over DDObject-level operations (create, delete,
  // transform, properties). Not persisted, like the rest of the store. A future
  // domino-level operation kind would join the same Operation union rather than
  // getting a stack of its own.
  undoStack: Operation[];
  redoStack: Operation[];
  undo: () => void;
  redo: () => void;
  // Records a completed canvas drag (move/resize) as one undo step. Called by
  // SelectionTool at a successful drop; it only records (it never touches
  // ddObjects itself, since the drag's live updateDDObject calls already left
  // the final state in place), and no-ops if before/after are equal (a
  // zero-distance drag).
  recordTransform: (before: DDObject, after: DDObject) => void;

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

export const useStore = create<AppState>()((set, get) => ({
  screen: "designer",
  setScreen: (screen) => set({ screen }),

  menuOpen: false,
  toggleMenu: () => set((s) => ({ menuOpen: !s.menuOpen })),
  closeMenu: () => set({ menuOpen: false }),

  helpOpen: false,
  toggleHelp: () => set((s) => ({ helpOpen: !s.helpOpen })),
  closeHelp: () => set({ helpOpen: false }),

  activeTool: "select",
  setTool: (activeTool) => set({ activeTool }),

  selectedDDObjectId: null,
  selectDDObject: (selectedDDObjectId) => set({ selectedDDObjectId }),

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

  undoStack: [],
  redoStack: [],
  undo: () => {
    const s = get();
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
    }
  },
  recordTransform: (before, after) =>
    set((s) =>
      ddObjectsEqual(before, after)
        ? {}
        : pushOperation(s.undoStack, { kind: "transform", before, after }),
    ),

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
}));