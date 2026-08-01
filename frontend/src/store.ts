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
import { useDominoDataStore } from "./dominoes/store";
import { syncDominoColorMemory } from "./dominoes/colorMemory";
import {
  createSeedInventory,
  modeDefault,
  MATERIAL_OPTIONS,
  FINISH_OPTIONS,
  BRAND_OPTIONS,
  NEW_ENTRY_COLOR,
  type InventoryEntry,
  type InventoryEntryId,
  type InventorySortColumn,
} from "./domino-inventory/object-model";

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
 * interdependent to diff/reapply piecemeal. "dominoColors" is the first
 * domino-level operation kind anticipated by that design: before/after are
 * the affected dominoes' previous/new inventory colorIds (0 = unassigned),
 * parallel to indices — typed arrays given how large a selection can get.
 * Applying it reaches into useDominoDataStore rather than ddObjects, and
 * touches neither dominoEditingId nor the domino selection store, which is
 * what lets undo/redo work whether or not domino editing mode is active.
 */
type Operation =
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
function pushOperation(undoStack: Operation[], op: Operation) {
  return { undoStack: [...undoStack, op].slice(-HISTORY_LIMIT), redoStack: [] as Operation[] };
}

function operationReferencesId(op: Operation, id: DDObjectId): boolean {
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
 * Deliberately conservative: checks every operation kind that could
 * reference `id`, even ones (transform/properties/dominoColors) that don't
 * themselves add or remove it from `ddObjects`, since a delete elsewhere on
 * the stack could still make it currently absent.
 */
export function isDDObjectInUndoHistory(id: DDObjectId): boolean {
  const { undoStack, redoStack } = useStore.getState();
  return (
    undoStack.some((op) => operationReferencesId(op, id)) ||
    redoStack.some((op) => operationReferencesId(op, id))
  );
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
    dominoEditingId?: null;
    activeTool?: ToolId;
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
  dominoEditingId: DDObjectId | null,
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
  // Defensive only: deleting the DDObject whose dominoes are being edited isn't
  // reachable through normal UI (the sidebar's delete menu is disabled for the
  // whole duration of domino editing mode, see Sidebar.tsx), but this keeps
  // dominoEditingId from ever pointing at a gone DDObject if some future path
  // removes one without going through that disabled UI.
  const dominoEditingDeleted = dominoEditingId !== null && doomedSet.has(dominoEditingId);

  return {
    patch: {
      ddObjects: nextDDObjects,
      ...(editingDeleted && {
        editingDDObjectId: null,
        editingSnapshot: null,
        creatingDDObjectId: null,
      }),
      ...(selectionDeleted && { selectedDDObjectId: null }),
      ...(dominoEditingDeleted && {
        dominoEditingId: null,
        activeTool: "select" as ToolId,
      }),
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
  // the rest of the UI by reading activeTool directly. exitDominoEditing is the
  // only action that leaves the mode (wired to ModeHintBar's Done/Cancel).
  dominoEditingId: DDObjectId | null;
  enterDominoEditing: (id: DDObjectId) => void;
  exitDominoEditing: () => void;

  // undoStack.length at the moment domino editing mode was entered (null when
  // not in the mode). While set, undo() refuses to pop past it — undo inside
  // the mode can only undo actions performed inside the mode, never reach
  // back into whatever was on the stack before entry (e.g. the very "create"
  // that made the field domino-editable in the first place).
  dominoEditingUndoFloor: number | null;

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
  // transform, properties) and domino color changes. Not persisted, like the
  // rest of the store.
  undoStack: Operation[];
  redoStack: Operation[];
  // Clamped by dominoEditingUndoFloor while in domino editing mode — see its
  // own doc comment.
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

  // ---- Domino Inventory (Domino Inventory screen) ----
  // A flat catalog of domino *types*, distinct from the placed-domino SoA data
  // in dominoes/store.ts. Small (dozens of rows), not performance-sensitive,
  // so it's a plain array here rather than a Record<id, Entry> — unlike
  // ddObjects, nothing here needs O(1) id-keyed lookup or parent/child
  // bookkeeping. Ephemeral: reseeded fresh every load, like the rest of the store.
  inventoryEntries: InventoryEntry[];
  // Next counter value for minting "INV-#" ids.
  nextInventoryNumber: number;
  // Prepend a new entry at the top with the spec's defaults; dropdown fields
  // default to the current mode across existing entries.
  addInventoryEntry: () => void;
  // The single write path for inline cell edits.
  updateInventoryEntry: (id: InventoryEntryId, patch: Partial<InventoryEntry>) => void;
  // Bulk delete (the trash-can button), called only after the confirm dialog.
  removeInventoryEntries: (ids: readonly InventoryEntryId[]) => void;

  // Row ids checked via the Select column, for bulk delete.
  inventorySelectedIds: Record<InventoryEntryId, true>;
  toggleInventorySelected: (id: InventoryEntryId) => void;
  // Used by the Select column header's select-all/none checkbox.
  setAllInventorySelected: (ids: readonly InventoryEntryId[], selected: boolean) => void;

  // Single active sort key + direction; null column = unsorted (seed/insertion order).
  inventorySortColumn: InventorySortColumn | null;
  inventorySortDirection: "asc" | "desc";
  // Clicking a header: same column reverses direction, a different column
  // sorts by it ascending.
  setInventorySort: (column: InventorySortColumn) => void;
}

export const useStore = create<AppState>()((set, get) => ({
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
  dominoEditingUndoFloor: null,
  enterDominoEditing: (id) =>
    set((s) => {
      const ddObject = s.ddObjects[id];
      if (!ddObject || !isDominoEditable(ddObject)) return {};
      return {
        dominoEditingId: id,
        selectedDDObjectId: id,
        activeTool: "editDominoes" as ToolId,
        dominoEditingUndoFloor: s.undoStack.length,
      };
    }),
  exitDominoEditing: () =>
    set((s) => {
      if (s.dominoEditingId) useDominoSelectionStore.getState().clear(s.dominoEditingId);
      return {
        dominoEditingId: null,
        selectedDDObjectId: s.dominoEditingId,
        activeTool: "select" as ToolId,
        dominoEditingUndoFloor: null,
        dominoColorLockedId: null,
        dominoColorShortcut: "",
      };
    }),

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

    const indices: number[] = [];
    const before: number[] = [];
    for (const i of selected) {
      if (i >= data.count || data.colorIds[i] === targetId) continue; // already this color
      indices.push(i);
      before.push(data.colorIds[i]);
    }
    if (indices.length === 0) return; // nothing actually changed

    for (const i of indices) data.colorIds[i] = targetId;
    useDominoDataStore.getState().bump(parentId);

    const after = Uint32Array.from(indices, () => targetId);
    const ddObject = s.ddObjects[parentId];
    if (ddObject) syncDominoColorMemory(ddObject, indices, after);

    set((st) =>
      pushOperation(st.undoStack, {
        kind: "dominoColors",
        parentId,
        indices: Uint32Array.from(indices),
        before: Uint32Array.from(before),
        after,
      }),
    );
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

  undoStack: [],
  redoStack: [],
  undo: () => {
    const s = get();
    // Clamped while in domino editing mode — never undo past whatever was
    // already on the stack when the mode was entered.
    if (s.dominoEditingUndoFloor !== null && s.undoStack.length <= s.dominoEditingUndoFloor) return;
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

  inventoryEntries: createSeedInventory(),
  nextInventoryNumber: 12,
  addInventoryEntry: () =>
    set((s) => {
      const numericId = s.nextInventoryNumber;
      const id: InventoryEntryId = `INV-${numericId}`;
      const entry: InventoryEntry = {
        id,
        numericId,
        active: true,
        colorName: "New Color",
        color: NEW_ENTRY_COLOR,
        material: modeDefault(s.inventoryEntries, "material", MATERIAL_OPTIONS),
        finish: modeDefault(s.inventoryEntries, "finish", FINISH_OPTIONS),
        brand: modeDefault(s.inventoryEntries, "brand", BRAND_OPTIONS),
        available: 0,
        shortcut: "",
        notes: "",
      };
      return {
        inventoryEntries: [entry, ...s.inventoryEntries],
        nextInventoryNumber: s.nextInventoryNumber + 1,
      };
    }),
  updateInventoryEntry: (id, patch) =>
    set((s) => ({
      inventoryEntries: s.inventoryEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  removeInventoryEntries: (ids) =>
    set((s) => {
      const doomed = new Set(ids);
      return {
        inventoryEntries: s.inventoryEntries.filter((e) => !doomed.has(e.id)),
        inventorySelectedIds: {},
      };
    }),

  inventorySelectedIds: {},
  toggleInventorySelected: (id) =>
    set((s) => {
      const next = { ...s.inventorySelectedIds };
      if (next[id]) delete next[id];
      else next[id] = true;
      return { inventorySelectedIds: next };
    }),
  setAllInventorySelected: (ids, selected) =>
    set(() => {
      if (!selected) return { inventorySelectedIds: {} };
      const next: Record<InventoryEntryId, true> = {};
      for (const id of ids) next[id] = true;
      return { inventorySelectedIds: next };
    }),

  inventorySortColumn: null,
  inventorySortDirection: "asc",
  setInventorySort: (column) =>
    set((s) =>
      s.inventorySortColumn === column
        ? { inventorySortDirection: s.inventorySortDirection === "asc" ? "desc" : "asc" }
        : { inventorySortColumn: column, inventorySortDirection: "asc" },
    ),
}));