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
 * The height of a layer that no layer definition reaches.
 *
 * Layer heights are the user's now, set by the layer definitions in the sidebar
 * and free to differ from one layer to the next; this is what the rest of the
 * structure falls back to above them. With no layer definitions at all every
 * layer takes it, which is why a fresh structure has the even spacing this
 * screen has always had.
 *
 * How the definitions are turned into a height per layer is
 * operation-types/layerDefinition/layers.ts.
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
 * How solid the sheets are that an operation draws while its properties are
 * open. Much fainter than the single layer sheet above, because there may be
 * dozens of them stacked up the screen and at anything like that opacity the
 * ones behind would add up into a solid wall.
 */
export const LAYER_PREVIEW_OPACITY = 0.22;

/**
 * How far in from each edge of the build plane the junction dots stop, so the
 * grid never runs right up to the edge of the surface it is drawn on. The grid
 * is anchored on the lower-left corner of what is left, which is why there is
 * always a dot exactly this far in from the bottom and the left.
 */
export const GRID_MARGIN_MM = 25;

/** The dots marking where a domino can be stood. Dark, to read against both the
 *  light build plane and the grey layer sheet over it. */
export const JUNCTION_DOT_COLOR = "#2c3038";

/**
 * How big a junction dot is drawn, **in screen pixels rather than millimetres**
 * — see JunctionDots.tsx, which also scales it for high-resolution displays.
 * Small enough to read as a point rather than a blob, which is what a grid this
 * dense needs.
 */
export const JUNCTION_DOT_SIZE_PX = 1.5;

/**
 * How far the dots float above the layer sheet they belong to. The sheet itself
 * records no depth so it cannot hide them, but the build plane does — and at
 * layer 1 the dots sit exactly on it.
 */
export const JUNCTION_DOT_LIFT_MM = 0.5;

/**
 * The most junctions a grid may ask for. A spacing typed one digit at a time
 * passes through some very small numbers, and at a millimetre apart the plane
 * wants over two million dots; without a ceiling that allocation lands on every
 * keystroke. A grid refused for crossing it says so in its warning banner rather
 * than silently drawing nothing.
 *
 * Set well clear of anything worth building rather than snugly: the tightest
 * grid the two overlap presets can make needs around eight thousand, and a
 * spacing has to come down near a domino's own thickness — where a junction
 * stops meaning anything — before this is reached at all. It is a guard against
 * a number still being typed, not a budget.
 */
export const MAX_JUNCTION_POINTS = 40000;

/**
 * How far the view may be tilted away from straight-down, in radians. Just
 * short of a quarter turn, which is the horizon — so the camera can look almost
 * edge-on at the build plane but never gets underneath it.
 */
export const MAX_POLAR_ANGLE = Math.PI / 2 - 0.02;