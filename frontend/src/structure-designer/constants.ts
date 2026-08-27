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

/**
 * How many layers that is, inclusive of both ends.
 *
 * Here rather than in one operation type's folder because two of them now stack
 * across the layers and both need the ceiling: layer definitions say how tall
 * each layer is, grid definitions say what its dominoes stand on. It is a fact
 * about the size of the world, which is what this file is for.
 */
export const LAYER_COUNT = MAX_LAYER - MIN_LAYER + 1;

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
 *
 * **The placement tool's pick plane sits at this same height**, so that the dot
 * the user is aiming at and the point the pointer reports are the same place on
 * screen however far the view is tilted. See DominoPlacementTool.tsx.
 */
export const JUNCTION_DOT_LIFT_MM = 0.5;

/**
 * The junction the pointer is nearest, and the one a domino is being dragged
 * toward. Bright blue against the dark dots and the grey sheet, and against a
 * cream domino too.
 */
export const JUNCTION_HIGHLIGHT_COLOR = "#1d6fc7";

/**
 * How big that mark is drawn, **in screen pixels rather than millimetres**, for
 * exactly the reason the dot itself is (see JUNCTION_DOT_SIZE_PX). Measured in
 * millimetres it would be a speck at one zoom and a slab at another; measured
 * this way it stays a box around the dot at every zoom. Several times the dot's
 * own size, so the black dot reads as sitting inside it.
 */
export const JUNCTION_HIGHLIGHT_SIZE_PX = 6;

/**
 * The order the highlight and the dot sitting inside it are drawn in.
 *
 * Both are needed because the two are at the same height, so which one shows
 * cannot be settled by which is nearer the camera. `renderOrder` decides it
 * instead — but it orders an object against **everything else in the scene**,
 * not just against its neighbour, which is the trap here. Anything below the
 * build plane's own order is drawn before the build plane and the layer sheet
 * and is then painted over by them, however opaque it is.
 *
 * So both sit above the ordinary scene, and the dot sits above the highlight:
 * the plane and the sheet go down first, the green mark lands on top of them,
 * and the black dot lands in the middle of that.
 */
export const JUNCTION_HIGHLIGHT_RENDER_ORDER = 1;
export const JUNCTION_DOT_RENDER_ORDER = 2;

/**
 * A domino's own colours. Cream, like the real thing, with a thin dark edge so
 * that a wall of them reads as separate pieces rather than one slab.
 *
 * Their own constants rather than the Designer's: that screen colours each
 * domino from the inventory, and this one is drawing a structure's shape rather
 * than its paint. Nothing here has anything to do with the domino colour store.
 */
export const DOMINO_FILL_COLOR = "#efe6d2";
export const DOMINO_EDGE_COLOR = "#2c3038";

/**
 * The edge colour of a domino that is selected.
 *
 * White, and deliberately the same white the Designer outlines a selected domino
 * in — the two screens have nothing else in common, but "this is a piece you are
 * about to act on" should not have to be learnt twice.
 *
 * It must stay neutral rather than becoming an actual colour. Nothing on this
 * screen is painted yet, but structures will eventually be, and a selection
 * marked in some hue would sit against the user's own choices.
 */
export const DOMINO_SELECTED_EDGE_COLOR = "#ffffff";

/**
 * The rectangle drawn while dominoes are being selected with a band.
 *
 * The same white the outline of a selected domino is, and for the same reason:
 * both say "these are the pieces you are about to act on", and the band turning
 * them white as it passes over them should read as one gesture rather than two
 * unrelated marks. Faint, because it is drawn over the very dominoes it is meant
 * to let the user look at.
 *
 * It is drawn with depth testing off and above the rest of the scene, so a band
 * thrown across a tall structure is not swallowed by whatever it passes behind —
 * hence its own render order rather than a height. That is the same trick the
 * junction marks use, and it has to sit above them too.
 */
export const SELECT_BAND_COLOR = "#ffffff";
export const SELECT_BAND_FILL_OPACITY = 0.16;
export const SELECT_BAND_EDGE_OPACITY = 0.85;
export const SELECT_BAND_RENDER_ORDER = 3;

/**
 * How solid the domino under the pointer is while it is still being placed.
 * Faint enough to be plainly not yet part of the structure, solid enough to show
 * exactly what will land.
 */
export const DOMINO_PREVIEW_OPACITY = 0.55;

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