/**
 * Fixed sizes and colours for the Structure Designer. Everything the screen
 * measures or paints with comes from here, so the canvas, the camera and the
 * layer control cannot disagree about any of it.
 *
 * Units are millimetres throughout, matching the rest of the app: one three.js
 * unit is one millimetre.
 */

/** The build plane's footprint. Its origin is its lower-left corner, at (0, 0). */
export const STRUCTURE_PLANE_WIDTH_MM = 1500;
export const STRUCTURE_PLANE_HEIGHT_MM = 1500;

/**
 * A very light grey-blue, deliberately unlike the Designer's warm tan plane, so
 * a glance at the canvas says which screen you are on. Not editable — this
 * plane is the world frame here, not something the user owns.
 */
export const STRUCTURE_PLANE_COLOR = "#dde3ec";

/**
 * How far apart the layers sit. Named DEFAULT because layer heights become
 * user-set, and variable between layers, in a later release — at which point
 * this stays as the value a new layer starts at.
 */
export const DEFAULT_LAYER_HEIGHT_MM = 24;

/** The layers a structure may be built over, lowest first. */
export const MIN_LAYER = 1;
export const MAX_LAYER = 100;

/** The grey sheet marking the layer being worked on. */
export const LAYER_PLANE_COLOR = "#8b9099";

/**
 * How solid that sheet is. Layer 1 lies flat on the build plane, so an opaque
 * sheet would hide the plane that identifies this screen in the screen's own
 * starting state. See LayerPlane.tsx.
 */
export const LAYER_PLANE_OPACITY = 0.55;

/**
 * How far the view may be tilted away from straight-down, in radians. Just
 * short of a quarter turn, which is the horizon — so the camera can look almost
 * edge-on at the build plane but never gets underneath it.
 */
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;