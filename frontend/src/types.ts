export type ScreenId = "dominoInventory" | "designer";

// "editDominoes" has no toolbar entry — it's entered only via double-click on a
// domino-editable DDObject (see registry.ts's isDominoEditable), never chosen
// from the toolbar's TOOLS list.
export type ToolId = "select" | "field" | "editDominoes";

/**
 * Imperative bridge to the three.js camera, registered from inside the R3F
 * <Canvas> by CameraRig and consumed by UI that lives outside the canvas
 * (toolbar buttons and later object lists).
 */
export interface CameraApi {
  /** Multiply the current zoom by `factor` (e.g. 1.05 to zoom in 5%). */
  zoomBy: (factor: number) => void;
  /** Set an absolute zoom level. */
  zoomTo: (zoom: number) => void;
  /** Fit the whole build plane in view and recenter at the origin. */
  resetZoom: () => void;
  /**
   * Pan/zoom so a given DDObject fills the canvas, less a small margin. A no-op
   * for types declaring no bounds(). Called on entering domino editing mode
   * (store.ts's enterDominoEditing) — not on ordinary selection.
   */
  frameDDObject: (id: string) => void;
}
