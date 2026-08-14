import { RiGridFill } from "@remixicon/react";

import { DOMINO_SIZE, type Position } from "../../dimensions";
import type { DDObjectBase, DDObjectTypeDefinition } from "../base";
import type { Bounds } from "../../types";
import FieldElementEditor from "./editor";
import FieldElementModeller from "./modeller";

/**
 * Level-1 element: a rectangular field of dominoes placed on the build plane.
 * The only child type available in this version.
 *
 * A field is describable two ways — by its physical size, or by how many
 * dominoes it holds. The properties editor drives the counts (rows /
 * dominoes_per_row) and the spacings, and normalizeSize() derives the physical
 * size that holds them exactly. A physical size is named directly only at
 * creation (a drawn region) or by dragging the selection handles, and both of
 * those turn it back into counts — fitCountsThenSize and setBounds below.
 *
 * The **boundary rectangle and the domino grid are deliberately decoupled**.
 * position/width/height is just the rectangle the user drags; the dominoes are
 * pinned to anchorX/anchorY (see below), so a resize from any edge adds or
 * removes rows and columns without moving a domino that already exists. The
 * price is that after a handle-drag the boundary can sit a sub-pitch gap away
 * from the outermost dominoes — that gap is the room the next row/column will
 * appear in, and is intentional. See setBounds and normalizeField below.
 *
 * The dominoes themselves live in the dominoes store, keyed by this DDObject's
 * id, and are regenerated from these parameters by the modeller.
 */
export interface FieldElementDDObject extends DDObjectBase {
  type: "fieldElement";
  
  /** number of domino rows in the field */
  rows: number;

  /** number of dominoes per row */
  dominoes_per_row: number;
  
  /** millimetres of clear space between adjacent rows */
  row_spacing: number;
  
  /** millimetres of clear space between adjacent dominoes within a row */
  domino_spacing: number;

  /** Physical extent along X and Y, in millimetres, the size of the blue box selection overlay.
   * Always the actual, displayed, full size of the field. 
   */
  width: number;
  height: number;

  /**
   * X-Y position of the field's lower-left corner, measured from the bottom
   * left of the build plane. Note: y correlates to the -Z position in three.js.
   * 
   * Always the true lower left of the full field dimensions. May not be aligned on a domino
   * if dragging either of the lower-left boundaries. 
   * 
   * This is the boundary rectangle used by bounds() and the selection
   * overlay — however, domino placement is anchored to anchorX/anchorY below, not to
   * this, which is what lets a resize move this freely without ever moving
   * an existing domino.
   */
  position: Position;

  /**
   * Absolute build-plane mm position of the field's original creation
   * corner. Set once (create()/createFromRegion()) and shifted only by an
   * actual translation of the whole field — a move — never by a resize. layoutField
   * (modeller.tsx) anchors every domino here (offset by originRow/originCol
   * and the current row/col), which is why growing or shrinking from any
   * edge never moves a domino that already existed.
   */
  anchorX: number;
  anchorY: number;

  /**
   * The logical row/col number of the field's original row 0 / col 0. As an example,
   * if the box grows down by two rows, then originRow = 2, meaning go up two rows
   * to find the original row 0 when the field was created.
   * 
   * This provides stable IDs for color memory, so that resizing can happen and
   * the colors don't shift around visually.
   */
  originRow: number;
  originCol: number;
}

// ── Geometry ──
//
// These live here, rather than in a module of their own, so the per-type folder
// keeps its object-model/editor/modeller shape and create() can normalise
// directly. Note that modeller.tsx imports them as values while this module
// imports the modeller as a value: a cycle that is benign only because nothing
// reads across it during module initialisation. Never call these at module
// scope.

/**
 * A row runs along +X and topples along it, so each domino presents its thin
 * edge down the row and its broad face across it — hence `thickness` sets the
 * pitch within a row and `width` sets it between rows.
 */
export const pitchX = (domino_spacing: number) =>
  DOMINO_SIZE.thickness + domino_spacing;

export const pitchY = (row_spacing: number) => DOMINO_SIZE.width + row_spacing;

/** The fields that say where a field's grid sits, independent of its box. */
type GridAnchored = Pick<
  FieldElementDDObject,
  "anchorX" | "anchorY" | "originRow" | "originCol" | "row_spacing" | "domino_spacing"
>;

/**
 * World mm of the grid's origin corner — where column 0's outer edge sits.
 *
 * `anchor - origin * pitch`, since originCol/originRow count how many columns
 * and rows now sit *before* the anchor after a west/south handle-drag. This is
 * the single definition of where the grid is: normalizeField re-hugs the
 * boundary box to it, layoutField places every domino from it, and
 * snapShapePoint quantises onto it. Do not hand-copy the expression a fourth
 * time — the three agreeing is what keeps a resize from moving existing
 * dominoes.
 */
export const gridOriginWorld = (field: GridAnchored) => ({
  x: field.anchorX - field.originCol * pitchX(field.domino_spacing),
  y: field.anchorY - field.originRow * pitchY(field.row_spacing),
});

/**
 * Parent-relative mm of the row-0 / col-0 domino's *centre* — the grid's phase
 * in the space DominoData.positions and shape-select's ShapePoint both live in.
 *
 * The half-extents turn the origin corner into the first domino's middle, and
 * subtracting `position` converts the world offset into the parent-relative
 * space DominoModeller's group expects.
 */
export const gridBaseLocal = (
  field: GridAnchored & Pick<FieldElementDDObject, "position">,
) => {
  const origin = gridOriginWorld(field);
  return {
    x: origin.x + DOMINO_SIZE.thickness / 2 - field.position.x,
    y: origin.y + DOMINO_SIZE.width / 2 - field.position.y,
  };
};

/**
 * Float-noise tolerance for the counting maths below, in mm. Every span here
 * is recomputed from values themselves derived from a pitch multiple, so a
 * boundary that should land exactly on one can arrive as a ~1e-10mm residue,
 * and floor/ceil have zero tolerance for that. Far below anything a pointer
 * drag could land on legitimately, so it only ever absorbs that noise, never
 * a real edit. It is applied when counting dominoes *into* a span, and
 * deliberately not when counting them back *out* of one — see signedFitCount.
 */
const GEOMETRY_EPS = 1e-6;

/**
 * How many complete dominoes fit in `span` — the last one has no trailing gap.
 * The epsilon is *added* so that a span of exactly `requiredSpan(n)` yields
 * `n` rather than `n - 1`; the two are inverses and must round-trip, since
 * fitCountsThenSize feeds one straight into the other.
 */
const fitCount = (span: number, pitch: number, spacing: number) =>
  Math.max(0, Math.floor((span + spacing + GEOMETRY_EPS) / pitch));

/** The exact span `n` dominoes occupy. Inverse of fitCount. */
const requiredSpan = (n: number, pitch: number, spacing: number) =>
  n > 0 ? n * pitch - spacing : 0;

/**
 * Signed sibling of fitCount, used by setBounds to count the dominoes between
 * one edge of the boundary rectangle and the anchor. Positive `span` is room
 * available (how many whole dominoes fit in it), negative `span` is
 * encroachment past the anchor (how many must be dropped, returned negative).
 *
 * **The `spacing` argument differs by edge**, which is why it is a parameter
 * rather than baked in. Measuring from the anchor *outwards* to the far edge
 * (right/top), the last domino needs only its own body and no trailing gap, so
 * the caller passes the real spacing — the `+ spacing` term is exactly that
 * missing trailing gap. Measuring from the near edge (left/bottom) *in* to the
 * anchor, every domino counted needs its body **and** the gap separating it
 * from its neighbour towards the anchor, so the caller passes `0` and a full
 * pitch of room is required per domino.
 *
 * The positive (more dominoes than anchor) branch is exactly fitCount, deliberately: a field dragged to a
 * given size must end up with the same counts as a field *created* at that
 * size, and delegating rather than restating the arithmetic is what guarantees
 * it. Only the shrink branch is new here.
 *
 * **That shrink branch does not apply GEOMETRY_EPS**, unlike everything else in
 * this file. A positive span is derived from pitch multiples (an edge previously
 * snapped to the grid), so it has to tolerate arriving a hair short of a whole
 * pitch or a row flickers at the boundary — that tolerance is what fixed the
 * flashing seen when dragging the bottom/left edges. A shrink span is a raw
 * pointer delta with no such derivation, and a boundary that has cut into a
 * domino's body should drop it immediately rather than render a line through
 * it. The exact branch does leave a ~1e-13mm window in which float residue
 * reads as encroachment; reaching it needs the far edge to land on the anchor
 * to within that distance, which pointer input cannot do. Considered and left
 * exact rather than overlooked.
 */
const signedFitCount = (span: number, pitch: number, spacing: number) =>
  span >= 0
    ? fitCount(span, pitch, spacing)
    : -Math.max(0, Math.ceil((-span) / pitch));

/** See dominoCellId below. */
const CELL_ID_BIAS = 1_000_000;
const CELL_ID_MULT = 2 * CELL_ID_BIAS + 1;

/**
 * A field's dominoes are laid out row-major from the grid origin — see
 * layoutField in modeller.tsx, which writes them in exactly this order. The one
 * place that decode lives, shared by the dominoRowCol hook and dominoCellId so
 * the two cannot drift apart.
 *
 * Row 0 is the *bottom* row: layoutField places it lowest and steps +Y upward,
 * and the camera looks straight down, so on screen a larger `row` is higher.
 * That's what satisfies dominoRowCol's "row increases toward what the user sees
 * as up" contract, and it makes the visual upper-left corner (max row, min col)
 * rather than (0, 0).
 */
const rowColOf = (field: FieldElementDDObject, flatIndex: number) => ({
  row: Math.floor(flatIndex / field.dominoes_per_row),
  col: flatIndex % field.dominoes_per_row,
});

/**
 * Spacings a new field starts with, whether it comes from create() or is drawn
 * on the build plane.
 */
const FIELD_DEFAULT_SPACING = {
  // Deliberately one domino thickness of clear space between rows, not a
  // literal that happens to match — if DOMINO_SIZE.thickness is ever corrected
  // this default is meant to follow it.
  row_spacing: DOMINO_SIZE.thickness,
  domino_spacing: 8,
};

/** The size↔counts fields the normalisation below is expressed over. */
type FieldSize = Pick<
  FieldElementDDObject,
  | "width"
  | "height"
  | "rows"
  | "dominoes_per_row"
  | "row_spacing"
  | "domino_spacing"
>;

/**
 * Derive the physical size that holds the current rows & dominoes_per_row
 * exactly. Every change made through the field properties editor runs through
 * this.
 *
 * It owns the size only, never the corner: re-deriving `position` needs the
 * anchor, which this generic FieldSize shape does not carry. normalizeField
 * below is the wrapper that has the whole field in hand and does both.
 */
function normalizeSize<T extends FieldSize>(field: T): T {
  const px = pitchX(field.domino_spacing);
  const py = pitchY(field.row_spacing);

  return {
    ...field,
    width: requiredSpan(field.dominoes_per_row, px, field.domino_spacing),
    height: requiredSpan(field.rows, py, field.row_spacing),
  };
}

/**
 * The one path that runs the relationship *backwards*: a field given by a
 * physical size (create()'s defaults, or a region drawn on the plane) but
 * stored counts-authoritative. 
 * 
 * This is only used on initial field creation, when the user draws a bounding
 * box for the field. It fits the row & dominoes_per_row to the size drawn, and
 * then shrinks the normalizeSize() will shrink the bounding box so it exactly
 * fits the outline of the dominoes created.
 * 
 * Resizes done by dragging bounding-box handles will go through setBounds() below.
 */
function fitCountsThenSize<T extends FieldSize>(field: T): T {
  const px = pitchX(field.domino_spacing);
  const py = pitchY(field.row_spacing);
  return normalizeSize({
    ...field,
    dominoes_per_row: fitCount(field.width, px, field.domino_spacing),
    rows: fitCount(field.height, py, field.row_spacing),
  });
}


/**
 * normalizeSize specialised to a full field — the shape every write path but
 * region-creation already has in hand.
 *
 * It also re-derives `position`, which normalizeSize alone cannot. Width and
 * height come from the counts, so the box's lower-left corner has to come from
 * the grid's own origin rather than stay pinned to the previous boundary: a
 * west/south handle-drag can leave a sub-pitch gap between the two (setBounds
 * only moves originCol/originRow at whole-pitch steps), and without this the
 * next editor edit would shrink the box off its *far* edge, pushing the last
 * row or column outside a boundary whose dominoes must not move.
 *
 * The grid origin comes from gridOriginWorld — the same one layoutField
 * (modeller.tsx) uses to place column 0 and snapShapePoint quantises onto. This
 * is therefore the one place the box is re-hugged to the grid; a drag never
 * does it.
 */
export const normalizeField = (field: FieldElementDDObject): FieldElementDDObject => {
  const sized = normalizeSize(field);
  return { ...sized, position: gridOriginWorld(sized) };
};

export const fieldElementDefinition: DDObjectTypeDefinition<FieldElementDDObject> = {
  type: "fieldElement",
  icon: RiGridFill,
  defaultName: "Domino Field",
  // Sized physically, with the counts left for fitCountsThenSize to fit — the
  // same path a drawn field takes.
  create: (id) =>
    fitCountsThenSize({
      id,
      type: "fieldElement",
      name: "Domino Field",
      rows: 0,
      dominoes_per_row: 0,
      ...FIELD_DEFAULT_SPACING,
      width: 300,
      height: 250,
      position: { x: 0, y: 0 },
      anchorX: 0,
      anchorY: 0,
      originRow: 0,
      originCol: 0,
    }),

  editor: FieldElementEditor,
  modeller: FieldElementModeller,
  dominoEditable: true,

  // Half the clear space on each side, so an expanded domino spans exactly one
  // pitch in each axis and the field tiles edge to edge with no gaps — which is
  // the largest target that still can't be confused with its neighbour. Nothing
  // on Z: the designer camera is top-down orthographic, so vertical growth would
  // cost matrix work for no visible benefit.
  //
  // A field with no spacing at all has nothing to grow into, and undefined is
  // what disables the Expand button for it.
  dominoExpansion: (field) =>
    field.domino_spacing <= 0 && field.row_spacing <= 0
      ? undefined
      : {
          x0: field.domino_spacing / 2,
          x1: field.domino_spacing / 2,
          y0: field.row_spacing / 2,
          y1: field.row_spacing / 2,
          z0: 0,
          z1: 0,
        },

  // Create an identifier for every domino in the field which is based on the domino's
  // row & column values to be used for mapping to the domino color.
  // 
  // Now that the contract for this ID is that it should remain constant even as the field is resized. 
  // In other words, a domino with ID value Z (say), should continue to have that ID even after
  // resizing the field. The absolute value does not matter, it is only used as a map key.
  // 
  // This is easy for resizes the upper or right boundaries (just adding dominoes to the end of the field)
  // but becomes more complex when resizing the lower or left boundaries (these change
  // the originCol and originRow values to allow for adding / removing columns or rows
  // along the lower/left boundaries).
  //
  // Since originCol and originRow can be negative, a large CELL_ID_BIAS is added to ensure
  // that the domino ID itself is always positive.
  dominoCellId: (field, flatIndex) => {
    const { row, col } = rowColOf(field, flatIndex);

    // the encoded values should equal zero when the row from the current layout
    // represents the original 0,0 position of the original layout.
    const encRow = row - field.originRow + CELL_ID_BIAS;
    const encCol = col - field.originCol + CELL_ID_BIAS;
    return encRow * CELL_ID_MULT + encCol;
  },

  // The field's row/column-like mapping, used to carry a pattern of colors from
  // one element to another (see base.ts's contract). Note this is deliberately
  // NOT anchor-relative, unlike dominoCellId above: this describes the layout as
  // it is right now, where that one has to survive a resize. They share only the
  // rowColOf decode.
  dominoRowCol: rowColOf,
  dominoIndexAt: (field, row, col) =>
    row >= 0 && row < field.rows && col >= 0 && col < field.dominoes_per_row
      ? row * field.dominoes_per_row + col
      : undefined,

  // Half a pitch, so the lattice carries a point on every domino's centre AND
  // one in the middle of every gap between them. Both are useful centres for a
  // circle: on a domino it takes an odd count each side, between two an even
  // one, and either way the counts match — which is the whole point (see
  // snapShapePoint's contract in base.ts).
  //
  // Deliberately NOT clamped to rows/dominoes_per_row. The lattice keeps going
  // past the field's own dominoes, because a shape's origin legitimately sits
  // outside it — a big circle whose arc just clips one edge is centred nowhere
  // near the field, and clamping would drag it back onto the boundary.
  snapShapePoint: (field, x, y) => {
    const base = gridBaseLocal(field);
    const stepX = pitchX(field.domino_spacing) / 2;
    const stepY = pitchY(field.row_spacing) / 2;
    return {
      x: base.x + Math.round((x - base.x) / stepX) * stepX,
      y: base.y + Math.round((y - base.y) / stepY) * stepY,
    };
  },

  // The anchor is exactly the point this contract asks for: it is the field's
  // original creation corner, it moves only under a whole-field translate, and
  // every domino's position is derived from it (gridOriginWorld). So a picture
  // placed relative to it keeps its registration with the grid through a resize
  // from any edge, where one placed relative to position or bounds would not.
  dominoLayoutAnchor: (field) => ({ x: field.anchorX, y: field.anchorY }),

  // The field's boundary rectangle — what CameraRig fits and frames to, what
  // SelectionTool draws its overlay/handles over and measures drags against,
  // and what CreateByRegionTool clamps a new region to. Note this is the box,
  // not the dominoes' own bounding box: after a handle-drag it can sit a
  // sub-pitch gap outside them (see the interface doc above), so it is not
  // interchangeable with dominoes/object-model.ts's extent().
  bounds: (field) => ({
    x: field.position.x,
    y: field.position.y,
    width: field.width,
    height: field.height,
  }),

  // How a region drawn on the build plane becomes a field: the region gives the
  // physical size, and the counts are fitted to it via the same
  // fitCountsThenSize create() uses — there is no FieldElementDDObject yet to
  // call normalizeField itself with, only the size subset, which is exactly
  // what normalizeSize was generalised to accept.
  //
  // Note that the original field will always have anchorX and anchorY be both the
  // position of the 0,0 domino and also the lower-left hand point of the original
  // bounding box, where the field will always start when created.

  createFromRegion: (region: Bounds) => {
    const fitted = fitCountsThenSize({
      width: region.width,
      height: region.height,
      rows: 0,
      dominoes_per_row: 0,
      ...FIELD_DEFAULT_SPACING,
    });
    if (fitted.rows < 1 || fitted.dominoes_per_row < 1) return undefined;

    return {
      position: { x:region.x, y:region.y },
      anchorX: region.x,
      anchorY: region.y,
      originRow: 0,
      originCol: 0,
      ...fitted,
    };
  },

  // Cursor move/resize: realise a target footprint on an existing field.
  //
  // The boundary rectangle is intended to grow around the anchorX and anchorY
  // positions, so that dominoes can be added as it grows in any dimension,
  // including adding dominoes to the bottom or left.
  // 
  // And so, after using the drag-handles to change the size, the bounding rectangle
  // may not always be aligned on a domino boundary, and that's okay. Gaps are expected
  // as the rectangle is dragged, and new columns / rows will show up only when there
  // is enough space (to the anchorX,anchorY position) to hold them.
  //
  setBounds: (field, bounds) => {

    const resized = bounds.height !== field.height || bounds.width !== field.width;
    if (!resized) {
      // This is a position change only, move the X and Y and the anchor positions together
      return {
        position: { x:bounds.x, y:bounds.y },
        anchorX: (field.anchorX - field.position.x) + bounds.x,
        anchorY: (field.anchorY - field.position.y) + bounds.y,
      };
    }

    const px = pitchX(field.domino_spacing);
    const py = pitchY(field.row_spacing);

    // Calculate the actual rows and columns which now fit within the new bounding box.
    //
    // This is done first from the left/lower boundary to the anchor point, and then 
    // from the anchor point to the right/upper boundary, and then these are added together.
    //
    // Note that full px / px (domino width + spacing) are used for lower and left boundaries,
    // whereas upper and right boundaries can add a domino with just the width and no spacing.

    const x_dist_to_anchor = field.anchorX - bounds.x
    const dominos_X_to_anchor = signedFitCount(x_dist_to_anchor, px, 0);
    const dominos_anchor_to_width = signedFitCount(bounds.width - x_dist_to_anchor, px, field.domino_spacing);
    const dominoes_per_row = dominos_X_to_anchor + dominos_anchor_to_width;

    const y_dist_to_anchor = field.anchorY - bounds.y;
    const dominos_Y_to_anchor = signedFitCount(y_dist_to_anchor, py, 0);
    const dominos_anchor_to_height = signedFitCount(bounds.height - y_dist_to_anchor, py, field.row_spacing);
    const rows = dominos_Y_to_anchor + dominos_anchor_to_height;

    // Too small to hold a domino — discard this drag frame (min-size guard,
    // exactly as createFromRegion does).
    if (rows < 1 || dominoes_per_row < 1) return undefined;

    // Note that when resized, the anchor positions do not change, only the position.(xy) position can change.
    return {
      width: bounds.width,
      height: bounds.height,
      position: { x:bounds.x, y:bounds.y },
      dominoes_per_row,
      rows,
      originCol: dominos_X_to_anchor,
      originRow: dominos_Y_to_anchor,
    };
  },
};


