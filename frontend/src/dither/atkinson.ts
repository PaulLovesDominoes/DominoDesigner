import { diffusionDither } from "./diffusion";

/**
 * Atkinson — error diffusion that deliberately throws part of the shortfall
 * away, which on a small palette usually looks better than keeping all of it.
 *
 * Six neighbours take an eighth each, so only three quarters of each domino's
 * shortfall is passed on and the remaining quarter is dropped:
 *
 *       .    X    1    1
 *       1    1    1    .
 *       .    1    .    .        (out of 8)
 *
 * X is the domino just finished with, and the three rows are the one being
 * walked and the two after it.
 *
 * Dropping a quarter is the whole point rather than an approximation of
 * Floyd-Steinberg. A shortfall the inventory simply cannot make up — a saturated
 * colour with nothing near it, or anything at all once the palette is down to
 * black and white — is passed along under Floyd-Steinberg until something
 * absorbs it, which shows as grain creeping out of a region into its
 * surroundings and as bright and dark areas losing their extremes. Letting a
 * quarter go at every step means such a shortfall fades out within a few
 * dominoes instead. Whites stay white, blacks stay black, and edges keep their
 * snap; what is given up is faithfulness on average, since the colours the
 * dominoes were given no longer add up to quite what the picture asked for, so
 * broad areas of middling tone come out slightly flatter.
 *
 * Which of the two suits a build is a matter of taste and of how many colours
 * are active. The fewer there are, the more Atkinson tends to win.
 */
export const atkinsonDither = diffusionDither("atkinson", "Atkinson", [
  { rowsAhead: 0, colsAhead: 1, share: 1 / 8 },
  { rowsAhead: 0, colsAhead: 2, share: 1 / 8 },
  { rowsAhead: 1, colsAhead: -1, share: 1 / 8 },
  { rowsAhead: 1, colsAhead: 0, share: 1 / 8 },
  { rowsAhead: 1, colsAhead: 1, share: 1 / 8 },
  { rowsAhead: 2, colsAhead: 0, share: 1 / 8 },
]);