import { orderedPatternAt } from "./ordered";
import { patternDither } from "./pattern";

/**
 * Bayer dithering on an 8x8 pattern — the same crosshatch as bayer4.ts, four
 * times the area.
 *
 * Its 64 steps blend far more finely than the 4x4's 16, so gradients come out
 * smoother, at the price of a repeat long enough that the pattern reads as
 * texture rather than as weave. The usual choice for a photograph; the 4x4 is
 * the one to reach for when the pattern is meant to be seen.
 *
 * Bigger squares than this are not offered. At domino scale a 16x16 repeat is
 * wider than most of what a person looks at in one go, so the pattern stops
 * being perceptible as a pattern and only adds noise.
 */
export const bayer8Dither = patternDither("bayer8", "Bayer 8x8", orderedPatternAt(8));