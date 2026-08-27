import * as THREE from "three";

import {
  DOMINO_EDGE_COLOR,
  DOMINO_FILL_COLOR,
  DOMINO_PREVIEW_OPACITY,
  DOMINO_SELECTED_EDGE_COLOR,
} from "./constants";

/**
 * The three.js objects every domino on this screen is drawn from, built once
 * when this module loads and shared by all of them.
 *
 * Two things are being shared, and they are shared for different reasons. A
 * **geometry** is the raw arrays of numbers describing a shape, which live on
 * the graphics card; one per domino would be thousands of uploads of the same
 * eight corners. A **material** is how a shape is painted; three.js compiles a
 * small GPU program for each distinct one, so a material per domino would be a
 * compile per domino.
 *
 * ## Why a box of size one
 *
 * There is a single box here rather than one per orientation, because every
 * domino is drawn through a matrix — a 4x4 table of numbers three.js uses to
 * move, turn and stretch a shape — and stretching a unit box by an orientation's
 * own extents is exactly as cheap as turning it. Non-uniform stretching is
 * usually a thing to be careful of, because it skews the surface directions a
 * lighting calculation needs; it is safe here because MeshBasicMaterial is
 * unlit, so no such direction is ever consulted.
 *
 * ## Why the fill is pushed back
 *
 * `polygonOffset` biases how far away the graphics card thinks a surface is,
 * measured in the depth buffer's own units and scaled by how steeply the surface
 * is tilted. Without it the black edges of a domino and its own cream faces are
 * at exactly the same depth, the card has to pick one, and a wall of touching
 * dominoes comes out as a single slab with no lines between the pieces.
 *
 * It has to go on the **fill** rather than the edges: WebGL only offers the
 * bias for filled triangles, not for lines. The other way of separating them —
 * lifting the edges a hair toward the camera — would work only when looking
 * straight down, and this is the one screen whose whole point is that the view
 * tips over. Same argument as StructureBuildPlane.tsx's.
 *
 * The technique is the Designer's, from dominoes/modeller.tsx, but that module
 * is deliberately **not** imported: it reaches into the app store, the DDObject
 * registry and image mapping, none of which exists on this side of the app.
 * Copying twenty lines is the price of the two halves staying independent.
 *
 * One piece of care that file needs and this one does not, so that nobody
 * carries it over: it switches view-culling off because its outlines cannot
 * report where they are, where a real geometry works that out for itself.
 *
 * ## Colours written by hand have to be converted by hand
 *
 * The other piece of care that file takes **does** apply here, and it did not
 * used to. A colour set on a material is converted for us out of the sRGB it is
 * written in and into the space the renderer works in; a colour written straight
 * into a buffer is not, and comes out visibly lighter than asked for.
 *
 * The dark edges used to be a plain `color` on their material and needed none of
 * this. They stopped being one when a selected domino had to be outlined white:
 * a colour per material would have meant a merged outline per colour, rebuilt
 * whole every time the selection changed — two million numbers a frame while a
 * rubber band is dragged over a real structure. So both colours now go into the
 * geometry, one per corner point, and both are converted here, once, when this
 * module loads. See DominoBatch.
 *
 * Pure white happens to be unchanged by that conversion, which is why only the
 * dark one would have shown the mistake.
 */

/**
 * A box one millimetre on each side. Every domino is this, stretched by its
 * orientation's extents.
 */
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * The twelve edges of that box, as twenty-four points making twelve line
 * segments. EdgesGeometry keeps only the lines where two faces meet at an
 * angle, so this is the outline of the box rather than a mesh of triangles.
 */
export const UNIT_BOX_EDGES = new THREE.EdgesGeometry(UNIT_BOX);

/** The cream faces of a placed domino. See the note on polygonOffset above. */
export const dominoFillMaterial = new THREE.MeshBasicMaterial({
  color: DOMINO_FILL_COLOR,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

/**
 * The two colours a domino's edges can be drawn in, converted once at load —
 * see the note above on why that conversion has to happen here.
 *
 * They are plain numbers rather than THREE.Color objects, laid out as red, green
 * and blue in a row, because that is the form they are copied into the geometry
 * in and a copy per corner point should not have to reach through an object to
 * get them.
 */
const edgeColorRgb = (hex: string): readonly [number, number, number] => {
  const color = new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
  return [color.r, color.g, color.b];
};

export const DOMINO_EDGE_RGB = edgeColorRgb(DOMINO_EDGE_COLOR);
export const DOMINO_SELECTED_EDGE_RGB = edgeColorRgb(DOMINO_SELECTED_EDGE_COLOR);

/**
 * The lines along a domino's edges.
 *
 * **It carries no colour of its own.** `vertexColors` tells the material to take
 * each line's colour from the geometry instead, which is what lets a selected
 * domino be outlined white without splitting the whole batch into a second
 * merged outline — see DominoBatch, and the note above.
 */
export const dominoEdgeMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
});

/**
 * The faces of the domino being dragged, which is not part of the structure yet.
 *
 * `depthWrite` is off because a see-through surface must not record its own
 * distance from the camera: with it on, the preview would punch a hole in
 * whatever is drawn after it and dominoes behind it would vanish rather than
 * showing through.
 */
export const dominoPreviewFillMaterial = new THREE.MeshBasicMaterial({
  color: DOMINO_FILL_COLOR,
  transparent: true,
  opacity: DOMINO_PREVIEW_OPACITY,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

/** The edges of that same preview, dimmed to match its faces. */
export const dominoPreviewEdgeMaterial = new THREE.LineBasicMaterial({
  color: DOMINO_EDGE_COLOR,
  transparent: true,
  opacity: DOMINO_PREVIEW_OPACITY,
  depthWrite: false,
});