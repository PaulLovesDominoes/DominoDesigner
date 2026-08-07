import { BufferGeometry, CircleGeometry, Vector3 } from "three";

import type { SelectionGestureMode } from "./base";

/**
 * The drag-preview layer: the depth ordering and the colours a region gesture
 * paints itself with while it is being drawn.
 *
 * Shared by the rectangle rubber band (DominoEditTool.tsx) and every
 * shape-select variant's Preview, so that every region gesture in the mode
 * looks like the same feature. If each variant hard-coded its own fill colour
 * and opacity they would drift apart as shapes are added, and nobody would
 * notice until two of them were on screen in the same session. Same
 * "one answer both consumers read" idiom as dominoes/expansion.ts.
 *
 * Everything here is about the region the user is sweeping out — never about
 * the dominoes. A domino's own outline colour is decided per domino in
 * dominoes/modeller.tsx and is not affected by any of this.
 *
 * CATCH_Z, OUTLINE_Z and MODE_OUTLINE_COLOR deliberately stay in
 * DominoEditTool: those are the tool's own layering and chrome (its
 * pointer-catching plane and the frame round the edited DDObject), not the
 * preview's.
 */

export const PREVIEW_FILL_Z = 1.5;
export const PREVIEW_BORDER_Z = 1.51;
export const PREVIEW_ORDER = 20;
export const PREVIEW_BORDER_ORDER = 21;

/**
 * The colours one region gesture draws itself in. Two sets exist, and which one
 * is used is the whole visual difference between adding dominoes to the
 * selection and taking them back out.
 */
export interface ShapePreviewStyle {
  fillColor: string;
  /** 0 = invisible, 1 = solid. The region is always see-through so the dominoes under it stay readable. */
  fillOpacity: number;
  borderColor: string;
}

/**
 * Selecting — a plain drag or Ctrl+drag. White, which is already what a
 * selected domino's outline is, so the region reads as "these are being taken".
 *
 * The opacity is lower than the deselect style's below because white over dark
 * dominoes washes them out far faster than a dark fill does; the two numbers
 * are tuned to look equally strong, not to match.
 */
export const SELECT_PREVIEW_STYLE: ShapePreviewStyle = {
  fillColor: "#ffffff",
  fillOpacity: 0.2,
  borderColor: "#ffffff",
};

/**
 * Deselecting — Alt+drag. The dark scheme every region gesture used before
 * deselection existed, which now carries a meaning: dark gives dominoes back,
 * white takes them.
 *
 * fillColor is --color-chrome, hard-coded because a three.js material cannot
 * read a CSS custom property.
 */
export const DESELECT_PREVIEW_STYLE: ShapePreviewStyle = {
  fillColor: "#2b2f36",
  fillOpacity: 0.35,
  borderColor: "#000000",
};

/** Which of the two styles a gesture in `mode` draws itself in. */
export const previewStyleFor = (mode: SelectionGestureMode): ShapePreviewStyle =>
  mode === "remove" ? DESELECT_PREVIEW_STYLE : SELECT_PREVIEW_STYLE;

/**
 * How round a round shape looks. 64 segments is smooth at any zoom the
 * orthographic camera reaches, without being worth measuring.
 */
const SEGMENTS = 64;

/**
 * A filled disc and a matching outline ring, both of radius 1 and centred on
 * the origin, shared by every round shape — circle scales them evenly, oval
 * scales x and y by different amounts to squash the disc into an ellipse. Any
 * later round-ish shape (a ring, an arc) wants the same two.
 *
 * Built once for the whole app and scaled per use, NOT rebuilt per frame as
 * `<circleGeometry args={[r, SEGMENTS]} />` would be — that would upload a
 * fresh 64-segment geometry to the GPU on every pointermove. Scaling one shared
 * shape is already this codebase's idiom (DominoEditTool's and SelectionTool's
 * unitEdges).
 *
 * Module-level rather than useMemo'd inside a component, because a Preview
 * mounts and unmounts on every gesture — a per-mount memo would churn two
 * geometries per drag for no gain. Never disposed, exactly like
 * dominoes/modeller.tsx's shared materials: there is one of each for the life
 * of the app.
 *
 * UNIT_RIM is its own ring of points rather than an EdgesGeometry taken from
 * UNIT_DISC. That would in fact work — the disc is a flat fan of triangles, so
 * only its boundary edges survive the edge cull and no spokes appear — but it
 * would depend on that cull for its correctness, carry the interior vertices
 * along, and read as an accident. An explicit ring says what it is.
 */
export const UNIT_DISC = new CircleGeometry(1, SEGMENTS);
export const UNIT_RIM = new BufferGeometry().setFromPoints(
  Array.from({ length: SEGMENTS }, (_, i) => {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    return new Vector3(Math.cos(angle), Math.sin(angle), 0);
  }),
);