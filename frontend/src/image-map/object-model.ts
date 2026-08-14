import { DOMINO_SIZE } from "../dimensions";
import { getDDObjectBounds, getDominoLayoutAnchor } from "../object-types/registry";
import type { DDObject } from "../object-types/registry";
import type { Bounds } from "../types";

/**
 * A picture laid over a domino element's grid, so its colors can be mapped onto
 * the dominoes. One per DDObject at most.
 */

/** Whether the picture draws over every domino, or only over the unpainted ones. */
export type ImageMapLayer = "above" | "below";

export interface DominoImageMap {
  /** The decoded file as a data URL. Nothing in this app is persisted, so this lives only for the session. */
  src: string;
  /** For display in the panel. */
  fileName: string;
  /** The file's own pixel dimensions, which fix the aspect ratio a corner drag preserves. */
  naturalWidth: number;
  naturalHeight: number;

  /**
   * The picture's rectangle in mm, relative to the element's domino layout
   * anchor — NOT to its position or its boundary box. See
   * `dominoLayoutAnchor` in object-types/base.ts for why; the short version is
   * that resizing a field from its west or south edge moves the box while the
   * dominoes stay put, and the picture has to stay with the dominoes.
   *
   * x/y is the lower-left corner. Negative values and values past the element
   * are entirely normal — the picture may hang off the element and off the
   * build plane both.
   */
  x: number;
  y: number;
  width: number;
  height: number;

  /** 0 (invisible) to 1 (solid). */
  opacity: number;
  /** The show/hide checkbox. Independent of opacity, so hiding doesn't lose the setting. */
  visible: boolean;
  layer: ImageMapLayer;
}

// ── Z layering ────────────────────────────────────────────────────────────────
//
// A standing domino's base sits at z = 0 and its top at DOMINO_SIZE.length. The
// camera looks straight down, so where the picture sits in z decides nothing
// about how big it looks — only what hides what.
//
// "above" is easy: put it over the tallest thing there is.
//
// "below" is the interesting one. It has to sit under painted dominoes and over
// unpainted ones, and every domino is exactly the same height, so there is no
// height that does both. The answer is to squash the unpainted ones (see
// underlay.ts): they draw at the same size from directly above, since the camera
// is orthographic and top-down, so the only thing that changes is which of them
// the picture covers.

/** Where the picture sits with layer "above" — clear of every domino. */
export const IMAGE_ABOVE_Z = DOMINO_SIZE.length + 2;

/** Where the picture sits with layer "below" — under a full-height domino's top. */
export const IMAGE_BELOW_Z = DOMINO_SIZE.length / 2;

/**
 * The top an unpainted domino is squashed to while a "below" picture is showing.
 * A little under IMAGE_BELOW_Z, so the picture is unambiguously in front of it.
 */
export const UNPAINTED_TOP_Z = IMAGE_BELOW_Z - 2;

/** The z a picture draws at for a given layer. */
export const imageLayerZ = (layer: ImageMapLayer) =>
  layer === "above" ? IMAGE_ABOVE_Z : IMAGE_BELOW_Z;

// ── Placement ─────────────────────────────────────────────────────────────────

/** Smallest width or height (mm) a resize may leave, so the rectangle can't invert. */
export const MIN_IMAGE_MM = 1;

/**
 * The build-plane point `ddObject`'s image coordinates are measured from.
 *
 * The one answer every consumer reads — the modeller that draws the picture, the
 * tool that drags it and the mapping run that samples it. If those three
 * disagreed about the origin, the picture the user lines up would not be the
 * picture that gets sampled.
 *
 * Falls back to the boundary corner for a type that declares no layout anchor,
 * which is the right answer for a type whose box and grid are the same thing.
 * Returns undefined only when the type has no footprint at all, in which case
 * there is nowhere to put a picture.
 */
export function imageOriginFor(ddObject: DDObject): { x: number; y: number } | undefined {
  const anchor = getDominoLayoutAnchor(ddObject);
  if (anchor) return anchor;
  const bounds = getDDObjectBounds(ddObject);
  return bounds ? { x: bounds.x, y: bounds.y } : undefined;
}

/** The picture's rectangle in build-plane mm. */
export function imageWorldRect(
  image: DominoImageMap,
  origin: { x: number; y: number },
): Bounds {
  return {
    x: origin.x + image.x,
    y: origin.y + image.y,
    width: image.width,
    height: image.height,
  };
}

/**
 * Where a newly loaded picture goes: scaled to *cover* the element's boundary
 * box — big enough to reach both edges, so every domino has picture over it —
 * and centred, which leaves it overhanging on whichever axis is the looser fit.
 *
 * Returned in anchor-relative mm, ready to store.
 */
export function coverPlacement(
  bounds: Bounds,
  origin: { x: number; y: number },
  naturalWidth: number,
  naturalHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(bounds.width / naturalWidth, bounds.height / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    x: bounds.x - origin.x + (bounds.width - width) / 2,
    y: bounds.y - origin.y + (bounds.height - height) / 2,
    width,
    height,
  };
}