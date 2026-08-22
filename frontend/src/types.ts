export type ScreenId = "dominoInventory" | "designer" | "structureDesigner";

/**
 * An axis-aligned rectangle on the build plane, in mm, measured from the plane's
 * lower-left origin.
 *
 * Deliberately not named for any one thing that has a rectangle. It started as a
 * DDObject's own footprint — what the camera fits or frames — but the same four
 * numbers describe a rubber-band drag, a region drawn to create an element with,
 * and the placement of an image mapped over a field, none of which is a DDObject.
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// "newElement" is the single element-placement tool, whatever type is being
// placed: *which* type that is lives beside it in the store (newElementType),
// not in this union. So registering a placeable type adds nothing here — the
// same split shape-select uses, where dominoShapeSelectId picks a gesture
// within "editDominoes" rather than being a ToolId of its own.
//
// "editDominoes" has no toolbar entry — it's entered only via double-click on a
// domino-editable DDObject (see registry.ts's isDominoEditable), never chosen
// from the toolbar.
export type ToolId = "select" | "newElement" | "editDominoes";

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
