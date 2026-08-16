import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import { DEFAULT_DOMINO_BRUSH_SIZE, type DominoBrushSizeId } from "./base";
import { DOMINO_BRUSHES, type DominoBrushId } from "./registry";

/**
 * Paint brush's slice of the app store (store.ts's AppState). Ordinary
 * copy-on-write view state belonging to one feature, which is what a slice is
 * for — nowhere near the different-mutation-discipline bar that earns a store of
 * its own (see CLAUDE.md's "State" section). The dominoes a stroke actually
 * *writes* are not here: those go through dominoes/appStoreSlice.ts, which owns
 * every colour write in the app.
 *
 * Fully acyclic, like shape-select's: it imports AppState type-only plus its own
 * base and registry, and nothing else. store.ts must still remain the only
 * importer of createPaintBrushSlice.
 */
export interface PaintBrushSlice {
  /**
   * Which paint brush is armed inside domino editing mode, or null for none.
   *
   * Deliberately NOT a ToolId, for the same reason dominoShapeSelectId isn't:
   * `activeTool` is a single slot already held by "editDominoes" for the whole
   * mode. This is a sub-mode within it — view state that exitDominoEditing
   * clears, never document state, never undoable.
   */
  dominoBrushId: DominoBrushId | null;
  /**
   * Each brush's chosen size. Per brush rather than global, so a large pencil
   * and a small quill can be kept side by side and switching tools doesn't
   * silently resize the other one.
   */
  dominoBrushSizes: Record<DominoBrushId, DominoBrushSizeId>;
  /**
   * Arms a brush, or disarms with null. Radio semantics against the shape-select
   * modes and the two image sub-modes: they all interpret canvas drags, so
   * arming a brush returns shape select to its default rectangle band and leaves
   * image mapping and Resize and Move, and each of those clears this in turn.
   *
   * That cross-slice write needs no import either way — `set` is typed against
   * the whole AppState, so each slice can see the others' members.
   *
   * It deliberately does NOT touch dominoSelectedSwatchId, so a brush picked up
   * while a colour is already chosen paints straight away. Clearing it here is
   * the obvious-looking addition and it is a trap: DominoBrushButton's size menu
   * calls this again for a brush already in hand, so a clear would take the
   * user's colour away on every size change, and again on every swap between
   * brushes.
   */
  setDominoBrush: (id: DominoBrushId | null) => void;
  setDominoBrushSize: (id: DominoBrushId, size: DominoBrushSizeId) => void;
}

/** Every registered brush starting at the same default size. */
const initialBrushSizes = Object.fromEntries(
  Object.keys(DOMINO_BRUSHES).map((id) => [id, DEFAULT_DOMINO_BRUSH_SIZE]),
) as Record<DominoBrushId, DominoBrushSizeId>;

export const createPaintBrushSlice: StateCreator<AppState, [], [], PaintBrushSlice> = (set) => ({
  dominoBrushId: null,
  dominoBrushSizes: initialBrushSizes,

  setDominoBrush: (dominoBrushId) =>
    set({
      dominoBrushId,
      dominoShapeSelectId: null,
      dominoShapeSelectHint: null,
      imageMapActive: false,
      imageTransformActive: false,
    }),

  setDominoBrushSize: (id, size) =>
    set((s) => ({ dominoBrushSizes: { ...s.dominoBrushSizes, [id]: size } })),
});