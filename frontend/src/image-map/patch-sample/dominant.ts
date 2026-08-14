import type { PatchSampleDefinition } from "./base";
import {
  averageChosenBuckets,
  chooseBucket,
  releaseTally,
  tallyPatchBuckets,
} from "./buckets";

/**
 * The most common color in the patch — the right answer for flat artwork.
 *
 * Pixels are sorted into coarse color buckets (buckets.ts) and the fullest bucket
 * wins. The solid interior of a region all falls into one bucket and wins easily,
 * while the fringe of blended pixels along an anti-aliased edge scatters across
 * many buckets with a fraction of a vote each and loses. The edge then lands
 * wherever the majority of the patch is, crisply, instead of being smeared into a
 * color that is in neither region.
 *
 * On a photograph this is the wrong choice and will look it: no bucket has a real
 * majority, so the winner is close to arbitrary and neighbouring dominoes jump
 * about. That is not a fault to be fixed — it is the same fact from the other
 * side, and it is why Average exists.
 *
 * See dominantMerged.ts for the variant that is harder to fool when the source
 * has some noise in it.
 */
export const dominantPatchSample: PatchSampleDefinition = {
  id: "dominant",
  label: "Dominant",

  sample: (pixels, bounds) => {
    const tally = tallyPatchBuckets(pixels, bounds);
    if (!tally) return null;

    // Strictly greater, so a tie goes to whichever bucket was met first. Scan
    // order is fixed, which is what keeps a run reproducible.
    let bestBucket = -1;
    let bestVotes = 0;
    for (const bucket of tally.used) {
      if (tally.votes[bucket] > bestVotes) {
        bestVotes = tally.votes[bucket];
        bestBucket = bucket;
      }
    }

    if (bestBucket < 0) {
      releaseTally();
      return null;
    }

    chooseBucket(bestBucket);
    const color = averageChosenBuckets(pixels, bounds);
    releaseTally();
    return color;
  },
};
