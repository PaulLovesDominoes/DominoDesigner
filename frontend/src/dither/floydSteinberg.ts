import { diffusionDither } from "./diffusion";

/**
 * Floyd-Steinberg — the original error-diffusion dither, and still the one to
 * reach for first.
 *
 * It passes on *all* of each domino's shortfall, split between the four
 * neighbours it has not reached yet, weighted so that the domino directly ahead
 * takes the largest share:
 *
 *       .    X    7
 *       3    5    1        (out of 16)
 *
 * X is the domino just finished with, the top row is the row being walked and
 * the bottom row the next one. Passing on all of it is what makes the result
 * faithful on average: over any region, the colours the picture asked for and
 * the colours the dominoes were given add up to the same total. The cost is that
 * a shortfall the inventory can never make up — a saturated colour with nothing
 * near it — keeps being handed along, which shows as a faint grain spreading out
 * from such a region. Atkinson is the answer to that, and drops part of it
 * instead.
 *
 * Compared with the Bayer dithers, the pattern here comes from the picture
 * rather than being laid over it, so there is no weave or crosshatch to see —
 * the grain follows the detail. On a photograph that is usually the better look;
 * on flat artwork the Bayers' regular texture may be what is wanted.
 */
export const floydSteinbergDither = diffusionDither("floydSteinberg", "Floyd-Steinberg", [
  { rowsAhead: 0, colsAhead: 1, share: 7 / 16 },
  { rowsAhead: 1, colsAhead: -1, share: 3 / 16 },
  { rowsAhead: 1, colsAhead: 0, share: 5 / 16 },
  { rowsAhead: 1, colsAhead: 1, share: 1 / 16 },
]);