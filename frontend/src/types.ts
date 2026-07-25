export type ScreenId = "settings" | "designer";

export type ToolId = "select" | "field";

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
  /** Pan/zoom so a given DDObject is comfortably framed. Stubbed in v1. */
  frameDDObject: (id: string) => void;
}
