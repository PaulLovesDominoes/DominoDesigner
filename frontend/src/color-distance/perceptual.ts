import { hexToRgbBytes } from "../color";
import type { ColorDistanceDefinition, PreparedColor } from "./base";
import { srgbToLab, type LabColor } from "./lab";

/**
 * Distance measured in CIE L*a*b*, where equal distances look like equal
 * differences to a person (see lab.ts). Far better than weighted RGB on
 * photographs and saturated artwork, where that metric tends to pick a color
 * which is numerically close but visibly the wrong shade.
 *
 * Perceptual (OKLab) is the newer answer to the same problem and is the default
 * here — this one is kept because the two disagree in the deep blues, and seeing
 * both makes it obvious which suits a particular picture.
 *
 * The inventory side is converted once in prepare(), and the color being asked
 * about once in sample(), so the inner loop is three subtractions and three
 * multiplications per candidate.
 */

interface PerceptualColor extends PreparedColor, LabColor {}

export const perceptualDistance: ColorDistanceDefinition<PerceptualColor, LabColor> = {
  id: "perceptual",
  label: "Perceptual (CIELAB)",

  prepare: (entries) =>
    entries
      .filter((entry) => entry.active)
      .map((entry) => {
        const [r, g, b] = hexToRgbBytes(entry.color);
        return { numericId: entry.numericId, ...srgbToLab(r, g, b) };
      }),

  sample: srgbToLab,

  distanceTo: (candidate, sample) => {
    const dl = sample.lightness - candidate.lightness;
    const da = sample.greenRed - candidate.greenRed;
    const db = sample.blueYellow - candidate.blueYellow;
    return dl * dl + da * da + db * db;
  },

  emptyMessage: "There are no active colors in the domino inventory.",
};