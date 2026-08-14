/**
 * Reading one color out of the patch of picture a domino covers.
 *
 * The mapping asks the same question once per domino — what color is the picture
 * over this domino? — and there is more than one defensible answer, because the
 * two kinds of picture people map want opposite things.
 *
 * A **photograph** wants the average. Fine detail should come out as the color an
 * area really reads as rather than as speckle, and neighbouring dominoes should
 * step smoothly.
 *
 * **Flat artwork** — a logo, an icon, a diagram — wants the opposite. Its edges
 * are anti-aliased, meaning the artwork was drawn with a fringe of in-between
 * pixels along every edge so it looks smooth on screen. Averaging across such an
 * edge produces a color that is in neither of the two regions it separates, and
 * the mapping then faithfully finds the nearest inventory color to a shade that
 * was never in the picture: a ring of yellow dominoes between an orange region
 * and a white one. Taking the *most common* color instead throws the fringe away,
 * because those in-between pixels are always a minority of the patch.
 *
 * So this is a registry, one file per way of reading a patch, in the same shape
 * as color-distance/ and dither/. Nothing outside this folder names a variant.
 */

import type { PatchBounds } from "./patchBounds";

export interface SampledColor {
  /** sRGB bytes, 0-255. Not necessarily whole numbers — this is a summary of many pixels. */
  r: number;
  g: number;
  b: number;
}

export interface PatchSampleDefinition {
  /** Registry key. Must match the key used in registry.ts. */
  id: string;
  /** Shown in the panel's Sampling dropdown. */
  label: string;

  /**
   * The color for this patch, or null when there is nothing usable there.
   *
   * `bounds` is the whole-pixel rectangle to read, already clamped to the image —
   * see patchBounds.ts, which every caller goes through first, so a variant never
   * has to range-check anything.
   *
   * Every variant weights by each pixel's alpha (how opaque it is) and returns
   * null for a patch that is mostly transparent, so a picture with a see-through
   * background does not paint its own empty space. MIN_OPAQUE_FRACTION below is
   * the shared threshold for that.
   */
  sample(pixels: ImageData, bounds: PatchBounds): SampledColor | null;
}

/**
 * How much of a patch has to be opaque for it to count. Below this the domino is
 * left alone.
 *
 * Shared rather than per variant: it is about whether there is a picture here at
 * all, which is not a question the two variants answer differently.
 */
export const MIN_OPAQUE_FRACTION = 0.25;

/**
 * The registry holds every variant behind one type. As with dither/ there is
 * nothing to erase — a patch sampler carries no state and no prepared type of its
 * own — so this is a plain alias, present so the registry reads the way its
 * neighbours do.
 */
export type AnyPatchSampleDefinition = PatchSampleDefinition;