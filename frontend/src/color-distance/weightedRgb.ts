import { hexToRgbBytes } from "../color";
import type { ColorDistanceDefinition, PreparedColor } from "./base";

/**
 * Straight red/green/blue comparison, with each channel counted differently to
 * roughly match how sensitive the eye is to it: green most, red least. Quick,
 * and good enough on flat graphic artwork where the colors are far apart anyway.
 *
 * It has no idea about perception beyond those three weights, so on photographs
 * it can pick a color that is numerically close but visibly the wrong shade —
 * that is what the two perceptual metrics are for.
 */

interface WeightedRgbColor extends PreparedColor {
  red: number;
  green: number;
  blue: number;
}

/** The color being asked about, passed through untouched. */
interface RgbSample {
  red: number;
  green: number;
  blue: number;
}

// Rough relative sensitivity of the eye to each channel.
const RED_WEIGHT = 2;
const GREEN_WEIGHT = 4;
const BLUE_WEIGHT = 3;

export const weightedRgbDistance: ColorDistanceDefinition<WeightedRgbColor, RgbSample> = {
  id: "weightedRgb",
  label: "Weighted RGB",

  prepare: (entries) =>
    entries
      .filter((entry) => entry.active)
      .map((entry) => {
        const [red, green, blue] = hexToRgbBytes(entry.color);
        return { numericId: entry.numericId, red, green, blue };
      }),

  // Nothing to precompute — this metric works on the bytes as they arrive.
  sample: (r, g, b) => ({ red: r, green: g, blue: b }),

  distanceTo: (candidate, sample) => {
    const dr = sample.red - candidate.red;
    const dg = sample.green - candidate.green;
    const db = sample.blue - candidate.blue;
    return RED_WEIGHT * dr * dr + GREEN_WEIGHT * dg * dg + BLUE_WEIGHT * db * db;
  },

  emptyMessage: "There are no active colors in the domino inventory.",
};