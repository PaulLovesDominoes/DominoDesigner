import type { PatchSampleDefinition } from "./base";
import {
  BUCKET_COUNT,
  BUCKET_LEVELS,
  averageChosenBuckets,
  bucketAt,
  bucketBlue,
  bucketGreen,
  bucketRed,
  chooseBucket,
  releaseTally,
  tallyPatchBuckets,
} from "./buckets";

/**
 * The most common color in the patch, counting neighbouring buckets together.
 *
 * Plain Dominant has one weakness, and it shows up on any source with a little
 * noise in it — a JPEG, a screenshot that has been rescaled, a band with a faint
 * gradient. The buckets are a fixed grid, so a region whose color happens to sit
 * on a boundary between two of them has its pixels split across both, each
 * getting half the votes. A smaller but better-centred pile then wins, and the
 * domino comes out a color that covers only a fraction of its patch. Shifting the
 * picture by a pixel changes which dominoes it happens to, which is what it looks
 * like from the outside: a stray domino or two in the middle of a flat band, in
 * different places each time the picture moves.
 *
 * The fix is to stop treating each bucket as a separate candidate. Buckets that
 * both hold pixels and sit next to each other in the color grid are joined into
 * one group, and the heaviest *group* wins. A pile split by a boundary is put
 * back together, and nothing is blurred: only buckets that actually contain
 * pixels ever join, and two neighbouring buckets are within about 8 to 14 of each
 * other out of 255 — far below anything a domino inventory could tell apart.
 *
 * The cost is proportional to how many *distinct* buckets a patch touches, which
 * for the flat artwork this variant is meant for is a handful.
 */

/**
 * Which group each bucket has been joined into. A bucket starts as its own group
 * and is repointed at another as they join, so following the chain from any
 * bucket arrives at the one bucket that stands for the whole group.
 *
 * Shared scratch like buckets.ts's own arrays and cleared the same way, over the
 * used-bucket list, at the end of every patch.
 */
const groupOf = new Int32Array(BUCKET_COUNT);
/** Total votes per group, held against the bucket that stands for it. */
const groupVotes = new Float64Array(BUCKET_COUNT);

/** Follows the chain to the bucket standing for this group. */
function groupFor(bucket: number): number {
  let root = bucket;
  while (groupOf[root] !== root) root = groupOf[root];
  // Point everything along the way straight at the answer, so later lookups are
  // one step. Without this, long chains make each lookup walk the whole thing.
  let walk = bucket;
  while (groupOf[walk] !== root) {
    const next = groupOf[walk];
    groupOf[walk] = root;
    walk = next;
  }
  return root;
}

/** Joins two groups into one. */
function joinGroups(a: number, b: number) {
  const rootA = groupFor(a);
  const rootB = groupFor(b);
  if (rootA !== rootB) groupOf[rootB] = rootA;
}

export const dominantMergedPatchSample: PatchSampleDefinition = {
  id: "dominantMerged",
  label: "Dominant, merged buckets",

  sample: (pixels, bounds) => {
    const tally = tallyPatchBuckets(pixels, bounds);
    if (!tally) return null;

    for (const bucket of tally.used) groupOf[bucket] = bucket;

    // Join every used bucket to any used bucket touching it, including corners —
    // brightness noise moves all three channels at once, so a pile can straddle a
    // boundary diagonally as readily as squarely.
    //
    // Each pair is looked at twice, once from each end, which costs a little and
    // saves having to work out which half of the neighbourhood is the "forward"
    // one. The list being short is what makes that a fair trade.
    for (const bucket of tally.used) {
      const red = bucketRed(bucket);
      const green = bucketGreen(bucket);
      const blue = bucketBlue(bucket);
      for (let dr = -1; dr <= 1; dr++) {
        const r = red + dr;
        if (r < 0 || r >= BUCKET_LEVELS) continue;
        for (let dg = -1; dg <= 1; dg++) {
          const g = green + dg;
          if (g < 0 || g >= BUCKET_LEVELS) continue;
          for (let db = -1; db <= 1; db++) {
            const b = blue + db;
            if (b < 0 || b >= BUCKET_LEVELS) continue;
            const neighbour = bucketAt(r, g, b);
            // Only buckets holding pixels join. An empty one has no votes, and
            // joining through it would let two piles with a gap between them
            // merge, which is the blurring this variant is avoiding.
            if (neighbour !== bucket && tally.votes[neighbour] > 0) {
              joinGroups(bucket, neighbour);
            }
          }
        }
      }
    }

    for (const bucket of tally.used) groupVotes[groupFor(bucket)] += tally.votes[bucket];

    // Strictly greater, so a tie goes to the group met first — the same fixed
    // scan order that keeps plain Dominant reproducible.
    let bestGroup = -1;
    let bestVotes = 0;
    for (const bucket of tally.used) {
      const group = groupFor(bucket);
      if (groupVotes[group] > bestVotes) {
        bestVotes = groupVotes[group];
        bestGroup = group;
      }
    }

    if (bestGroup >= 0) {
      for (const bucket of tally.used) {
        if (groupFor(bucket) === bestGroup) chooseBucket(bucket);
      }
    }

    const color = bestGroup < 0 ? null : averageChosenBuckets(pixels, bounds);

    for (const bucket of tally.used) {
      groupOf[bucket] = 0;
      groupVotes[bucket] = 0;
    }
    releaseTally();
    return color;
  },
};
