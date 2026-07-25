import { RiGridFill } from "@remixicon/react";

import { DOMINO_SIZE, type Position } from "../../dimensions";
import type {
  DDObjectBase,
  DDObjectBounds,
  DDObjectTypeDefinition,
} from "../base";
import FieldElementEditor from "./editor";
import FieldElementModeller from "./modeller";
import { fromMm, roundDisplay, toMm, type LengthUnit, DEFAULT_DISPLAY_UNIT } from "../../units";

/**
 * Level-1 element: a rectangular field of dominoes placed on the build plane.
 * The only child type available in this version.
 *
 * A field is describable two ways — by its physical size, or by how many
 * dominoes it holds — and `fixed_size` says which one is authoritative. The
 * other is derived; see normalizeSize, which is the only place that
 * relationship is expressed (normalizeField and createFromRegion are both
 * thin callers of it).
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

  /**
   * Which description wins. True: width/height are authoritative and the counts
   * are refitted to them. False: the counts are authoritative and width/height
   * grow to hold them exactly.
   */
  fixed_size: boolean;

  /** Unit displayWidth/displayHeight are expressed in; shared by both fields. */
  displayUnit: LengthUnit;

  /** physical extent along X and Y, in millimetres */
  width: number;
  height: number;

  displayWidth: number;
  displayHeight: number;

  /**
   * X-Y position of the field's lower-left corner, measured from the bottom
   * left of the build plane. Note: y correlates to the -Z position in three.js.
   */
  position: Position;
  displayPosition: Position;

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

/** How many complete dominoes fit in `span` — the last one has no trailing gap. */
const fitCount = (span: number, pitch: number, spacing: number) =>
  Math.max(0, Math.floor((span + spacing) / pitch));

/** The exact span `n` dominoes occupy. Inverse of fitCount. */
const requiredSpan = (n: number, pitch: number, spacing: number) =>
  n > 0 ? n * pitch - spacing : 0;

/**
 * Spacings a new field starts with, whether it comes from create() or is drawn
 * on the build plane.
 */
const FIELD_DEFAULT_SPACING = { row_spacing: 7.5, domino_spacing: 8 };

/** The size↔counts fields the fixed_size relationship is expressed over. */
type FieldSize = Pick<
  FieldElementDDObject,
  | "displayWidth"
  | "width"
  | "displayHeight"
  | "height"
  | "rows"
  | "dominoes_per_row"
  | "row_spacing"
  | "domino_spacing"
  | "displayUnit"
  | "fixed_size"
>;

/**
 * Force a field self-consistent for its fixed_size mode. Every write path runs
 * through this — directly for a full field (`normalizeField`), or with a
 * partial draft for a region being turned into one (`createFromRegion`) — so
 * the size and the counts can never disagree. Generic so both callers get
 * their own shape back rather than being widened to FieldElementDDObject.
 */
function normalizeSize<T extends FieldSize>(field: T): T {
  const px = pitchX(field.domino_spacing);
  const py = pitchY(field.row_spacing);

  if (field.fixed_size) {
    return {
      ...field,
      dominoes_per_row: fitCount(field.width, px, field.domino_spacing),
      rows: fitCount(field.height, py, field.row_spacing),
    };
  }

  // Calculate width/height based on dominoes
  const newDispWidth = roundDisplay(fromMm(
    requiredSpan(field.dominoes_per_row, px, field.domino_spacing), field.displayUnit),
    field.displayUnit);
  const newDispHeight= roundDisplay(
    fromMm(requiredSpan(field.rows, py, field.row_spacing), field.displayUnit),
    field.displayUnit);

  // output new width/height

  return {
    ...field,
    displayWidth: newDispWidth,
    displayHeight: newDispHeight,
    width: toMm(newDispWidth, field.displayUnit),
    height: toMm(newDispHeight, field.displayUnit),
  };
}

/**
 * A field given by a physical size but stored counts-authoritative: fit the
 * counts to the size, then let the size shrink to exactly what those counts
 * occupy. Two passes of the same relationship, so the field satisfies its own
 * fixed_size === false invariant the instant it exists.
 */
function fitCountsThenSize<T extends FieldSize>(field: T): T {
  const fitted = normalizeSize({ ...field, fixed_size: true });
  return normalizeSize({ ...fitted, fixed_size: false });
}


/** normalizeSize specialised to a full field — the shape every write path but
 *  region-creation already has in hand. */
export const normalizeField = (field: FieldElementDDObject): FieldElementDDObject =>
  normalizeSize(field);

export const fieldElementDefinition: DDObjectTypeDefinition<FieldElementDDObject> = {
  type: "fieldElement",
  icon: RiGridFill,
  defaultName: "Domino Field",
  // Sized physically, with the counts left for normalizeField to fit — the same
  // path a drawn field takes.
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
      fixed_size: false,
      position: { x: 0, y: 0 },
      displayWidth:0.300,
      displayHeight:0.250,
      displayPosition: {x:0, y:0},
      displayUnit: "m"
    }),

  editor: FieldElementEditor,
  modeller: FieldElementModeller,

  // The field's physical footprint. Needs no generated dominoes, so a field is
  // framable the instant it exists.
  bounds: (field) => ({
    x: field.position.x,
    y: field.position.y,
    width: field.width,
    height: field.height,
  }),

  // How a region drawn on the build plane becomes a field: the region is the
  // physical size (fixed_size), and the counts are fitted to it via the same
  // normalizeSize the full-object write paths use — there is no
  // FieldElementDDObject yet to call normalizeField itself with, only the size
  // subset, which is exactly what normalizeSize was generalised to accept.
  createFromRegion: (region: DDObjectBounds) => {

    // Round the values as appropriate for the chosend display value
    const newDispWidth = roundDisplay(fromMm(region.width, DEFAULT_DISPLAY_UNIT), DEFAULT_DISPLAY_UNIT);
    const newDispHeight= roundDisplay(fromMm(region.height, DEFAULT_DISPLAY_UNIT), DEFAULT_DISPLAY_UNIT);
    const newDispX = roundDisplay(fromMm(region.x, DEFAULT_DISPLAY_UNIT), DEFAULT_DISPLAY_UNIT);
    const newDispY = roundDisplay(fromMm(region.y, DEFAULT_DISPLAY_UNIT), DEFAULT_DISPLAY_UNIT);

    const fitted = fitCountsThenSize({
      width: toMm(newDispWidth, DEFAULT_DISPLAY_UNIT),
      height: toMm(newDispHeight, DEFAULT_DISPLAY_UNIT),
      displayWidth: newDispWidth,
      displayHeight: newDispHeight,
      displayUnit: DEFAULT_DISPLAY_UNIT,
      rows: 0,
      dominoes_per_row: 0,
      fixed_size: true,
      ...FIELD_DEFAULT_SPACING,
    });
    if (fitted.rows < 1 || fitted.dominoes_per_row < 1) return undefined;

    return {
      position: {
        x: toMm(newDispX, DEFAULT_DISPLAY_UNIT),
        y: toMm(newDispY, DEFAULT_DISPLAY_UNIT)
      },
      displayPosition: { x: newDispX, y: newDispY },
      ...fitted,
    };
  },

  // Cursor move/resize: realise a target footprint on an existing field. Rounds
  // through the field's own displayUnit and runs normalizeField, so it agrees
  // with the editor and createFromRegion by construction. A resize (width or
  // height changed) forces fixed_size ON so the drag sticks — otherwise the
  // counts would reassert the old size; a pure move leaves fixed_size alone.
  setBounds: (field, bounds) => {
    const unit = field.displayUnit;
    const resized = bounds.width !== field.width || bounds.height !== field.height;

    const newDispWidth = roundDisplay(fromMm(bounds.width, unit), unit);
    const newDispHeight = roundDisplay(fromMm(bounds.height, unit), unit);
    const newDispX = roundDisplay(fromMm(bounds.x, unit), unit);
    const newDispY = roundDisplay(fromMm(bounds.y, unit), unit);

    const fitted = normalizeField({
      ...field,
      fixed_size: resized ? true : field.fixed_size,
      width: toMm(newDispWidth, unit),
      height: toMm(newDispHeight, unit),
      displayWidth: newDispWidth,
      displayHeight: newDispHeight,
      position: { x: toMm(newDispX, unit), y: toMm(newDispY, unit) },
      displayPosition: { x: newDispX, y: newDispY },
    });
    // Too small to hold a domino — discard this drag frame (min-size guard,
    // exactly as createFromRegion does).
    if (fitted.rows < 1 || fitted.dominoes_per_row < 1) return undefined;

    return fitted;
  },
};


// ── Display vs Stored ──
//
// There are two sets of displayed units vs their stored, normalized versions:  
// Width/height, and position:x/y.  Each of these have both displayed versions 
// and physical versions.
//
// Display versions hold exactly what the user entered, these are mirrored to the 
// physical (used for modelling / rendering) versions. Display version is the source
// of truth, so there is never float noise from round-tripping a value through mm and back.

// This is where these relationships are expressed

export const withDisplayWidth = (
  ddObject: FieldElementDDObject,
  displayWidth: number,
): Partial<FieldElementDDObject> => ({
  displayWidth,
  width: toMm(displayWidth, ddObject.displayUnit),
});

export const withDisplayHeight = (
  ddObject: FieldElementDDObject,
  displayHeight: number,
): Partial<FieldElementDDObject> => ({
  displayHeight,
  height: toMm(displayHeight, ddObject.displayUnit),
});

export const withDisplayPosition = (
  ddObject: FieldElementDDObject,
  displayPosition: Position,
): Partial<FieldElementDDObject> => ({
  displayPosition,
  position:{x:toMm(displayPosition.x, ddObject.displayUnit), y:toMm(displayPosition.y, ddObject.displayUnit)}
});

/**
 * Switching units doesn't change the plane's physical size — only how it's
 * displayed — so this recomputes displayWidth/displayHeight from the
 * unaffected canonical width/height, rather than converting the (possibly
 * already-rounded) display values themselves.
 */
export const withDisplayUnit = (
  ddObject: FieldElementDDObject,
  displayUnit: LengthUnit,
): Partial<FieldElementDDObject> => ({
  displayUnit,
  displayWidth: roundDisplay(fromMm(ddObject.width, displayUnit), displayUnit),
  displayHeight: roundDisplay(fromMm(ddObject.height, displayUnit), displayUnit),
  displayPosition: {
    x:roundDisplay(fromMm(ddObject.position.x, displayUnit), displayUnit),
    y:roundDisplay(fromMm(ddObject.position.y, displayUnit), displayUnit) 
  }
}
);
