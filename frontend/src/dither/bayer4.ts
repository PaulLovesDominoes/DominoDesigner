import { orderedPatternAt } from "./ordered";
import { patternDither } from "./pattern";

/**
 * Bayer dithering on a 4x4 pattern — the crosshatch, repeating every four
 * dominoes in each direction.
 *
 * The tighter of the two Bayer sizes. Its 16 steps give a coarser blend than the
 * 8x8, but the pattern itself repeats often enough to read as a distinct woven
 * texture in the finished build, which is worth having as an effect in its own
 * right and not only as a way of hiding bands.
 *
 * Note the repeat is a rectangle on the ground rather than a square: a field's
 * spacing across is not the same as its spacing up, so four dominoes one way is
 * a different distance from four the other. Indexing by row and column is still
 * right — the pattern has to land on the dominoes — but do not expect a square
 * motif.
 */
export const bayer4Dither = patternDither("bayer4", "Bayer 4x4", orderedPatternAt(4));