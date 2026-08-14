import { nearestColor } from "../color-distance/registry";
import type { AnyColorDistanceDefinition, PreparedColor } from "../color-distance/base";

/**
 * How far a dither should nudge a domino's colour, worked out from the palette
 * the run is actually going to choose from.
 *
 * It has to be measured rather than fixed, because the right amount depends
 * entirely on how finely the inventory divides the range from black to white.
 * With only black and white to choose from there is one boundary in the middle,
 * and a nudge has to be able to carry a domino most of the way across the range
 * to have any effect at all. With forty colours the boundaries are close
 * together and the same nudge would fling a domino several colours away from the
 * one the picture called for, which is scatter rather than blending.
 *
 * This was originally a single constant, which turned out to be right for a
 * five-colour palette and wrong everywhere else — four times too small on black
 * and white, so a photograph came out as a plain threshold with a little
 * dithering in the midtones and none anywhere else.
 */

/**
 * The classic amount for a palette of N evenly spaced levels. Combined with a
 * pattern spanning -0.5 to +0.5, it nudges a domino by up to half the distance
 * to its neighbouring colour — far enough to cross the boundary when the picture
 * is close to it, never far enough to skip past a colour entirely.
 */
const FULL_RANGE_BYTES = 255;

/**
 * Measures the palette by walking the grey ramp: for every level from black to
 * white, ask which inventory colour this metric would pick, and count how many
 * different answers come back. That count is the number of steps the palette
 * resolves the range into.
 *
 * Asking through `nearestColor` rather than looking at the inventory directly is
 * the whole trick. It means the answer is about the colours this *metric* is
 * willing to use and how it judges them — Greyscale, which throws most of the
 * inventory away, gets a much bigger nudge than OKLab looking at the same
 * inventory, and switching between them re-measures with no extra code.
 *
 * Returns 0 when there is nothing to dither between, which the caller multiplies
 * by and so needs no special case for.
 *
 * The cost is 256 lookups once per mapping run, against tens of thousands of
 * dominoes in the run itself.
 *
 * One thing it only estimates: the grey ramp measures how finely the palette
 * divides *lightness*, which is the direction a dither nudge moves in, but a
 * palette of strong colours divides lightness differently at different hues. So
 * this is a good starting amount rather than an exact one, which is what the
 * strength slider on top of it is for.
 */
export function resolveDitherAmplitude(
  metric: AnyColorDistanceDefinition,
  candidates: readonly PreparedColor[],
): number {
  const winners = new Set<number>();
  for (let level = 0; level <= 255; level++) {
    const nearest = nearestColor(metric, candidates, level, level, level);
    if (nearest) winners.add(nearest.numericId);
  }
  if (winners.size < 2) return 0;
  return FULL_RANGE_BYTES / (winners.size - 1);
}