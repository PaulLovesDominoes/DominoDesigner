import { hexToRgbBytes } from "../color";
import type { ColorDistanceDefinition, PreparedColor } from "./base";
import { srgbToOklab, type OklabColor } from "./oklab";

/**
 * OKLab again, but with lightness counted for more than hue — so when the
 * inventory forces a compromise, the metric gives up some color accuracy to keep
 * the light-and-dark structure of the picture intact.
 *
 * Two things make that the right trade for some pictures. A painting builds its
 * shapes out of light and shade rather than out of hue, so getting a value wrong
 * flattens a form in a way that getting a hue wrong does not. And a domino build
 * is looked at from across a room, where the eye reads the pattern of light and
 * dark long before it reads the colors — the same reason a photograph still
 * reads correctly in black and white but not when its values are scrambled.
 *
 * The cost is real and is the point: skin tones and other passages where hue
 * carries the meaning will drift towards whatever inventory color is closest in
 * lightness. Perceptual (OKLab) is the metric that keeps those honest.
 */

interface ValueWeightedColor extends PreparedColor, OklabColor {}

/**
 * How much more a difference in lightness counts than one in hue. Squared along
 * with everything else below, so 2 here means a lightness difference weighs four
 * times what the same numeric difference along a color axis does.
 */
const VALUE_WEIGHT = 2;

export const valueWeightedDistance: ColorDistanceDefinition<
  ValueWeightedColor,
  OklabColor
> = {
  id: "valueWeighted",
  label: "Value-weighted",

  prepare: (entries) =>
    entries
      .filter((entry) => entry.active)
      .map((entry) => {
        const [r, g, b] = hexToRgbBytes(entry.color);
        return { numericId: entry.numericId, ...srgbToOklab(r, g, b) };
      }),

  sample: srgbToOklab,

  distanceTo: (candidate, sample) => {
    // OKLab's lightness runs 0 to 1, and its two color axes reach about the same
    // magnitude, so the weight below is the whole of the bias — there is no
    // scale mismatch to correct for first. This would not be true of CIELAB,
    // whose lightness runs to 100.
    const dl = (sample.lightness - candidate.lightness) * VALUE_WEIGHT;
    const da = sample.greenRed - candidate.greenRed;
    const db = sample.blueYellow - candidate.blueYellow;
    return dl * dl + da * da + db * db;
  },

  emptyMessage: "There are no active colors in the domino inventory.",
};