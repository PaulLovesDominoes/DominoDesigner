/**
 * sRGB -> CIE L*a*b*, shared by the metrics that want a perceptual answer.
 *
 * The point of L*a*b* is that equal distances in it look like equal differences
 * to a person, which plain RGB badly fails at — in RGB, two dark colors and two
 * light ones the same numeric distance apart look nothing alike. L* is
 * lightness (0 black to 100 white), a* runs green-to-red and b* blue-to-yellow.
 *
 * Getting there takes two steps. First undo the "gamma" curve that sRGB stores
 * colors with (linearRgb.ts), giving light intensities that add up the way
 * physical light does. Then convert those to CIE XYZ, a color space defined by
 * measurements of human vision, and finally to L*a*b*, which is XYZ bent so that
 * the distances come out even.
 *
 * See oklab.ts for the newer space that does the same job with better behaved
 * hues, and note the two report lightness on different scales.
 */

import { srgbBytesToLinear } from "./linearRgb";

// D65 — the standard "daylight" white that sRGB is defined against. Dividing
// XYZ through by it is what makes white come out at L* = 100.
const WHITE_X = 0.95047;
const WHITE_Y = 1.0;
const WHITE_Z = 1.08883;

// The cube-root curve that bends XYZ into L*a*b*, with a straight-line section
// near zero (a cube root's slope runs away to infinity at 0, which would make
// near-black colors wildly oversensitive).
const CURVE_KNEE = 6 / 29;
const CURVE_KNEE_CUBED = CURVE_KNEE * CURVE_KNEE * CURVE_KNEE;
const CURVE_SLOPE = 1 / (3 * CURVE_KNEE * CURVE_KNEE);
const CURVE_OFFSET = 4 / 29;

function labCurve(t: number): number {
  return t > CURVE_KNEE_CUBED ? Math.cbrt(t) : CURVE_SLOPE * t + CURVE_OFFSET;
}

export interface LabColor {
  /** Lightness, 0 (black) to 100 (white). */
  lightness: number;
  /** Green (negative) to red (positive). */
  greenRed: number;
  /** Blue (negative) to yellow (positive). */
  blueYellow: number;
}

/**
 * Converts one sRGB color to L*a*b*.
 *
 * Channels are 0-255 and need not be whole numbers — an average of several
 * pixels is a perfectly ordinary thing to ask about. See linearRgb.ts's
 * toByteIndex, which is load-bearing.
 */
export function srgbToLab(r: number, g: number, b: number): LabColor {
  const linear = srgbBytesToLinear(r, g, b);

  // Linear RGB -> CIE XYZ, the standard sRGB matrix at D65.
  const x = 0.4124564 * linear.red + 0.3575761 * linear.green + 0.1804375 * linear.blue;
  const y = 0.2126729 * linear.red + 0.7151522 * linear.green + 0.072175 * linear.blue;
  const z = 0.0193339 * linear.red + 0.119192 * linear.green + 0.9503041 * linear.blue;

  const fx = labCurve(x / WHITE_X);
  const fy = labCurve(y / WHITE_Y);
  const fz = labCurve(z / WHITE_Z);

  return {
    lightness: 116 * fy - 16,
    greenRed: 500 * (fx - fy),
    blueYellow: 200 * (fy - fz),
  };
}