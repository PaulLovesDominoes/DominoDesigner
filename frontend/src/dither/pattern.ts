import type { DitherDefinition, DitherRunContext, DitherRun, Rgb } from "./base";

/**
 * Building a *pattern* dither — one whose shift comes from the domino's grid
 * position and nothing else. none.ts, bayer4.ts, bayer8.ts and random.ts are all
 * one call to this; the shared machinery behind the two Bayers is in ordered.ts.
 *
 * Not a registered variant itself, the same arrangement ordered.ts and
 * color-distance/lab.ts have.
 */

/**
 * A pattern's value for one domino: between -0.5 and +0.5, where positive means
 * "shift this one lighter". A unit value with no colour in it — how far to
 * actually push depends on how far apart the palette's colours are, which the
 * pattern has no way of knowing.
 */
export type PatternAt = (row: number, col: number) => number;

/**
 * Makes a pattern dither from its pattern.
 *
 * **A pattern supplies one number, and that is deliberate.** Adding the same
 * amount to red, green and blue moves a colour along the light-to-dark axis,
 * which is what makes a dither pattern read as a blend between two inventory
 * colours. Moving the channels independently would shift the hue as well, and
 * against a scattered handful of inventory colours — rather than a regular grid
 * of them — that scatters dominoes into unrelated hues instead of blending. It
 * also keeps dithering meaningful under the Greyscale metric, where a hue shift
 * could not change the answer at all.
 *
 * Taking the pattern as a single number here is what *enforces* that, rather
 * than leaving it as a rule to remember: a pattern variant has no way to express
 * three separate channels. The diffusing dithers do move channels
 * independently, and are right to — see diffusion.ts, where the amount is
 * measured from what actually happened rather than invented.
 */
export function patternDither(id: string, label: string, patternAt: PatternAt): DitherDefinition {
  return {
    id,
    label,
    scanOrder: "any",

    createRun({ amplitude, strength }: DitherRunContext): DitherRun {
      const scale = amplitude * strength;

      // The same object handed back every call, refilled each time: one
      // allocation for the whole run rather than one per domino, the trade
      // patch-sample/buckets.ts makes with its tally arrays. The mapping loop
      // reads it straight away and never holds on to it.
      const shift: Rgb = { r: 0, g: 0, b: 0 };

      return {
        colorShiftAt(row, col) {
          const amount = patternAt(row, col) * scale;
          shift.r = amount;
          shift.g = amount;
          shift.b = amount;
          return shift;
        },

        // A pattern is fixed in advance, so what a domino came out as tells it
        // nothing.
        recordChoice() {},
      };
    },
  };
}