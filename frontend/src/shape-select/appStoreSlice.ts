import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import { getShapeSelect, type ShapeSelectId } from "./registry";

/**
 * Shape select's slice of the app store (store.ts's AppState). Ordinary
 * copy-on-write state that happens to belong to one feature, which is exactly
 * what a slice is for — it doesn't come close to the different-mutation-discipline
 * bar that earns a store of its own (see CLAUDE.md's "State" section).
 *
 * Fully acyclic, unlike the dominoes and history slices: it imports AppState
 * type-only and its own registry, and nothing else. store.ts must still remain
 * the only importer of createShapeSelectSlice.
 */
export interface ShapeSelectSlice {
  /**
   * Which shape-select gesture is armed inside domino editing mode, or null for
   * the default rectangle rubber band.
   *
   * Deliberately NOT a ToolId: `activeTool` is a single slot already held by
   * "editDominoes" for the whole mode, and seven files gate on that exact value
   * (Toolbar, Sidebar, SelectionTool, CreateByRegionTool, DesignerCanvas's
   * onPointerMissed, ModeHintBar, DesignerScreen). This is a sub-mode *within*
   * it. Like dominoExpanded it is view state that exitDominoEditing clears,
   * never document state — nothing here is undoable.
   */
  dominoShapeSelectId: ShapeSelectId | null;
  /**
   * Arms a shape, or returns to the rectangle band with null. Radio semantics:
   * the toolbar's Rectangle button is how a shape is left, so a shape's own
   * button never turns itself off.
   *
   * Also disarms any armed paint brush and leaves both image sub-modes, since
   * they all interpret canvas drags and only one can own them; each of the other
   * slices clears this in turn. None of them imports another — `set` is typed
   * against the whole AppState, so each can see the others' members.
   */
  setDominoShapeSelect: (id: ShapeSelectId | null) => void;

  /**
   * What ModeHintBar shows for the armed shape, including any mid-sequence
   * stage text a variant's hint() produces.
   *
   * Written by DominoEditor rather than derived, because the live gesture
   * state lives in a ref inside the <Canvas> while the hint bar is ordinary
   * DOM. A plain string (never an object) so a selector reading it can't trip
   * React #185, and DominoEditor writes it only when it actually changes, so
   * a per-pointermove step costs a string compare rather than a store write.
   */
  dominoShapeSelectHint: string | null;
  setDominoShapeSelectHint: (hint: string | null) => void;
}

export const createShapeSelectSlice: StateCreator<AppState, [], [], ShapeSelectSlice> = (set) => ({
  dominoShapeSelectId: null,
  setDominoShapeSelect: (dominoShapeSelectId) =>
    set({
      dominoShapeSelectId,
      dominoShapeSelectHint: dominoShapeSelectId
        ? getShapeSelect(dominoShapeSelectId).hint(undefined)
        : null,
      dominoBrushId: null,
      imageMapActive: false,
      imageTransformActive: false,
    }),

  dominoShapeSelectHint: null,
  setDominoShapeSelectHint: (dominoShapeSelectHint) => set({ dominoShapeSelectHint }),
});