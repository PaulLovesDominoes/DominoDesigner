import type { DDObject } from "./object-types/registry";
import type { DDObjectId } from "./object-types/base";
import type { ToolId } from "./types";

/**
 * Pure operations over the DDObject hierarchy, factored out of store.ts so both
 * the recording actions (store.ts's removeDDObject) and the history slice's
 * undo/redo can share them without importing each other.
 *
 * Everything here takes its inputs explicitly and touches no store. That is the
 * point rather than an accident: applying history must never itself record a new
 * operation, or inverting a `create` would push a `delete` and corrupt the
 * stacks. Keeping the raw halves in a module that *cannot reach an action* makes
 * that a structural property instead of a convention someone has to remember —
 * see store.ts's removeDDObject (the recording wrapper) versus history's
 * undo()/redo(), which call these directly.
 */

/** Ids of `id` and everything beneath it, for a recursive delete. */
export function collectSubtree(
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

// DDObjects are plain JSON-safe data, so whole-object equality is cheap. This
// only ever runs at a commit point (dialog Save, drag pointer-up) — never per
// keystroke/frame — so a no-op session (nothing actually changed) pushes nothing.
export function ddObjectsEqual(a: DDObject, b: DDObject): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface RemovalResult {
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
 * history must never itself record a new operation — store.ts's public
 * removeDDObject action calls this and additionally pushes a `delete` entry;
 * undo/redo call this directly and never push anything from it, which is what
 * keeps inverting a `create` (a raw removal) from being mistaken for a
 * user-initiated delete.
 */
export function applyRemoveDDObject(
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
export function applyInsertDDObjects(
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