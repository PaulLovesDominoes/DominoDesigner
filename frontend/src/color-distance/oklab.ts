/**
 * sRGB -> OKLab, the other perceptual space here (see lab.ts for CIELAB).
 *
 * OKLab does the same job as CIELAB — bend the numbers so that equal distances
 * look like equal differences — but it was fitted to newer measurements and is
 * markedly better behaved in one specific way: hue stays put. CIELAB's worst
 * known fault is that blues swing towards purple as they lighten, so two colors
 * a person reads as "the same blue, one darker" come out further apart in
 * CIELAB than they should, and a color search can pick a visibly wrong shade.
 * Deep blues and violets are exactly what fills the shadows of a painting, which
 * is why this is the better default here.
 *
 * It is also cheaper: two 3x3 matrices and three cube roots, with no white-point
 * division and no piecewise curve.
 *
 * **Its lightness runs 0 to 1, where CIELAB's runs 0 to 100.** Anything that
 * weights lightness against the color axes has to be written for one scale or
 * the other; valueWeighted.ts is written for this one.
 */

import { srgbBytesToLinear } from "./linearRgb";

export interface OklabColor {
  /** Lightness, 0 (black) to 1 (white). */
  lightness: number;
  /** Green (negative) to red (positive). */
  greenRed: number;
  /** Blue (negative) to yellow (positive). */
  blueYellow: number;
}

/**
 * Converts one sRGB color to OKLab.
 *
 * Channels are 0-255 and need not be whole numbers — see linearRgb.ts's
 * toByteIndex, which is load-bearing.
 */
export function srgbToOklab(r: number, g: number, b: number): OklabColor {
  const linear = srgbBytesToLinear(r, g, b);

  // Linear RGB -> LMS, an approximation of the responses of the three kinds of
  // cone cell in the eye. Ottosson's published matrix.
  const longWave =
    0.4122214708 * linear.red + 0.5363325363 * linear.green + 0.0514459929 * linear.blue;
  const mediumWave =
    0.2119034982 * linear.red + 0.6806995451 * linear.green + 0.1073969566 * linear.blue;
  const shortWave =
    0.0883024619 * linear.red + 0.2817188376 * linear.green + 0.6299787005 * linear.blue;

  // The cube root is what makes the spacing perceptual, the same role the
  // piecewise curve plays in CIELAB. Math.cbrt handles negatives correctly,
  // which matters because a channel can go slightly below zero on colors just
  // outside the sRGB gamut.
  const l = Math.cbrt(longWave);
  const m = Math.cbrt(mediumWave);
  const s = Math.cbrt(shortWave);

  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    greenRed: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    blueYellow: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}