import { hexToRgbBytes } from "../color";
import type { ColorDistanceDefinition, PreparedColor } from "./base";
import { srgbToLab } from "./lab";

/**
 * Black, white and grey only — the image is matched on lightness alone and its
 * hues are thrown away.
 *
 * This is an ordinary metric rather than a special case anywhere, because the
 * only thing that makes it different is which colors it is willing to choose
 * from: prepare() keeps just the achromatic entries. See the note on prepare in
 * base.ts.
 */

interface GreyColor extends PreparedColor {
  /** L* from CIE L*a*b*, 0 (black) to 100 (white). */
  lightness: number;
}

/**
 * How far apart a color's channels may be and still count as grey. A little
 * slack rather than requiring exactly r = g = b, because real inventory greys
 * are rarely perfectly neutral — a "warm grey" domino is still a grey domino as
 * far as this metric is concerned.
 */
const GREY_TOLERANCE_BYTES = 12;

export const greyscaleDistance: ColorDistanceDefinition<GreyColor, number> = {
  id: "greyscale",
  label: "Greyscale",

  prepare: (entries) => {
    const greys: GreyColor[] = [];
    for (const entry of entries) {
      if (!entry.active) continue;
      const [r, g, b] = hexToRgbBytes(entry.color);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (spread > GREY_TOLERANCE_BYTES) continue;
      greys.push({ numericId: entry.numericId, lightness: srgbToLab(r, g, b).lightness });
    }
    return greys;
  },

  // Matched on L* rather than on any of the usual quick brightness formulas,
  // because L* is spaced the way the eye sees lightness — so a run of greys
  // comes out evenly stepped instead of bunching up in the dark end. The two
  // color axes are computed and thrown away, which is cheaper than it looks now
  // that this runs once per domino rather than once per candidate.
  sample: (r, g, b) => srgbToLab(r, g, b).lightness,

  distanceTo: (candidate, sample) => {
    const dl = sample - candidate.lightness;
    return dl * dl;
  },

  emptyMessage:
    "There are no active black, white or grey colors in the domino inventory.",
};