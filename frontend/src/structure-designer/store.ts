import { create } from "zustand";

import { MAX_LAYER, MIN_LAYER } from "./constants";

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
 * domain, so call sites read useStructureStore((s) => s.layer).
 */

/**
 * An edit to the structure being designed, undoable independently of the
 * Designer's own history.
 *
 * Nothing on this screen edits anything yet, so this union has no members and
 * both stacks below stay empty. It is declared now because it is what makes the
 * separation structural: undo() and redo() here can only ever reach this
 * store's stacks, so pressing Ctrl+Z on this screen can never silently change
 * the domino build on the other one — which the user could not see happen. The
 * first structure editing tool adds the first member and one case to each of
 * the two actions.
 */
export type StructureOperation = never;

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

  cameraApi: StructureCameraApi | null;
  setCameraApi: (cameraApi: StructureCameraApi | null) => void;

  savedView: SavedView | null;
  setSavedView: (savedView: SavedView | null) => void;

  undoStack: StructureOperation[];
  redoStack: StructureOperation[];
  undo: () => void;
  redo: () => void;
}

export const useStructureStore = create<StructureState>()((set) => ({
  layer: MIN_LAYER,
  // Clamped here rather than at the call sites, so every way of changing the
  // layer — dragging the slider, its arrow keys, and whatever is added later —
  // is clamped once, in one place.
  setLayer: (layer) =>
    set({ layer: Math.min(MAX_LAYER, Math.max(MIN_LAYER, Math.round(layer))) }),

  cameraApi: null,
  setCameraApi: (cameraApi) => set({ cameraApi }),

  savedView: null,
  setSavedView: (savedView) => set({ savedView }),

  undoStack: [],
  redoStack: [],
  // Both stacks are always empty this release (see StructureOperation), so
  // there is nothing for these to pop and the toolbar's buttons stay disabled —
  // which is honest, there being nothing on this screen yet to take back. The
  // first structure edit gives each of these a switch over the operation it
  // pops, and the stacks to move it between.
  undo: () => {},
  redo: () => {},
}));