/**
 * sRGB bytes -> linear light, shared by every perceptual color space here.
 *
 * Colors on a screen are not stored proportional to the amount of light they
 * emit. They go through a "gamma" curve, which spends more of the 0-255 range on
 * dark values because that is where the eye can tell shades apart. Undoing that
 * curve gives numbers that add up the way physical light does, which is the
 * starting point for both CIELAB (lab.ts) and OKLab (oklab.ts).
 */

/**
 * Byte -> linear light, precomputed for all 256 values. The conversion involves
 * a fractional power, which is slow enough to matter when a mapping run calls
 * this three times per domino across tens of thousands of dominoes; there are
 * only 256 possible inputs, so a table removes it entirely.
 */
const LINEAR_FROM_BYTE = new Float64Array(256);
for (let byte = 0; byte < 256; byte++) {
  const channel = byte / 255;
  LINEAR_FROM_BYTE[byte] =
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/**
 * Rounds and range-limits a channel so it is safe to use as an index into the
 * table above.
 *
 * **This is not defensive tidiness — leaving it out is a bug that fails
 * silently, and it has already happened once.** Callers legitimately pass
 * averages rather than whole numbers (image-map/sampling.ts averages a patch of
 * pixels, giving values like 137.42, and dithering then adds an offset to it),
 * and reading a typed array at a fractional index gives back `undefined` rather
 * than rounding or interpolating. Every value downstream then becomes NaN, and
 * NaN compares false against everything — so the nearest-color search finds no
 * candidate at all and simply paints nothing, with no error anywhere.
 *
 * TypeScript cannot warn about it: a typed array's index signature is typed
 * `number` whatever the index is, so `LINEAR_FROM_BYTE[137.42]` type-checks
 * perfectly and is `undefined` at run time. Any lookup table added here later
 * needs the same treatment.
 *
 * Rounding costs nothing real. The table has 256 entries because the pixels
 * these values came from had 256 possible levels. The clamping is what makes a
 * dither offset safe to add before the conversion rather than after.
 */
export const toByteIndex = (channel: number) =>
  Math.min(255, Math.max(0, Math.round(channel)));

/** One color's three channels, converted from sRGB bytes to linear light. */
export interface LinearRgb {
  red: number;
  green: number;
  blue: number;
}

/**
 * Converts one sRGB color to linear light. Channels are 0-255 and need not be
 * whole numbers — see toByteIndex, which is load-bearing.
 */
export function srgbBytesToLinear(r: number, g: number, b: number): LinearRgb {
  return {
    red: LINEAR_FROM_BYTE[toByteIndex(r)],
    green: LINEAR_FROM_BYTE[toByteIndex(g)],
    blue: LINEAR_FROM_BYTE[toByteIndex(b)],
  };
}