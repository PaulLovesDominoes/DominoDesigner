import { hexToRgbBytes } from "../color";
import type { ColorDistanceDefinition, PreparedColor } from "./base";
import { srgbToOklab, type OklabColor } from "./oklab";

/**
 * Distance measured in OKLab (see oklab.ts). The default metric, and the one to
 * reach for on photographs and paintings.
 *
 * It does the same job as Perceptual (CIELAB) and mostly agrees with it. Where
 * they differ is worth knowing: CIELAB drifts in hue as a color gets lighter or
 * darker, worst of all in the blues, so it can rate a slightly purple shade as
 * the closest match to a deep blue. OKLab holds hue steady, so shadows and
 * anything else built out of dark blues and violets come out with the shade a
 * person would have picked.
 *
 * A plain straight-line distance is the right measure here, because the space
 * was built so that one would be.
 */

interface OklabPreparedColor extends PreparedColor, OklabColor {}

export const perceptualOklabDistance: ColorDistanceDefinition<
  OklabPreparedColor,
  OklabColor
> = {
  id: "oklab",
  label: "Perceptual (OKLab)",

  prepare: (entries) =>
    entries
      .filter((entry) => entry.active)
      .map((entry) => {
        const [r, g, b] = hexToRgbBytes(entry.color);
        return { numericId: entry.numericId, ...srgbToOklab(r, g, b) };
      }),

  sample: srgbToOklab,

  distanceTo: (candidate, sample) => {
    const dl = sample.lightness - candidate.lightness;
    const da = sample.greenRed - candidate.greenRed;
    const db = sample.blueYellow - candidate.blueYellow;
    return dl * dl + da * da + db * db;
  },

  emptyMessage: "There are no active colors in the domino inventory.",
};