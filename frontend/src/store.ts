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
      // The build plane is the hierarchy's root; there is nowhere to put its
      // children, so it is undeletable (the row menu greys the entry out too).
      if (id === s.rootId || !s.ddObjects[id]) return {};

      const doomed = collectSubtree(s.ddObjects, id);
      const ddObjects: Record<DDObjectId, DDObject> = {};
      for (const [key, ddObject] of Object.entries(s.ddObjects)) {
        if (doomed.has(key)) continue;
        ddObjects[key] =
          "children" in ddObject && ddObject.children.includes(id)
            ? { ...ddObject, children: ddObject.children.filter((c) => c !== id) }
            : ddObject;
      }

      // A dialog left open on a deleted DDObject would put it back on cancel.
      const editingDeleted =
        s.editingDDObjectId !== null && doomed.has(s.editingDDObjectId);

      return {
        ddObjects,
        ...(editingDeleted && {
          editingDDObjectId: null,
          editingSnapshot: null,
          creatingDDObjectId: null,
        }),
      };
    }),

  editingDDObjectId: null,
  editingSnapshot: null,
  creatingDDObjectId: null,
  openProperties: (id) =>
    set((s) => ({ editingDDObjectId: id, editingSnapshot: s.ddObjects[id] ?? null })),
  saveProperties: () =>
    set((s) => ({
      editingDDObjectId: null,
      editingSnapshot: null,
      creatingDDObjectId: null,
      // Finishing a creation ends the tool's placement mode. A plain edit
      // leaves whatever tool is active alone.
      ...(s.creatingDDObjectId ? { activeTool: "select" as ToolId } : {}),
    })),
  cancelProperties: () => {
    const creatingId = get().creatingDDObjectId;

    // Cancelling a creation discards the DDObject outright — it was never saved.
    // removeDDObject already detaches it from its parent and closes the dialog.
    if (creatingId) {
      get().removeDDObject(creatingId);
      set({ creatingDDObjectId: null, activeTool: "select" });
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