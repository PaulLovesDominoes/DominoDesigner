import { MIN_OPAQUE_FRACTION, type SampledColor } from "./base";
import type { PatchBounds } from "./patchBounds";

/**
 * Sorting a patch's pixels into coarse color buckets and counting them. Shared by
 * the two dominant-color variants, in its own module alongside them the same way
 * patchBounds.ts, lab.ts and ordered.ts are.
 *
 * Counting exact colors cannot work: along an anti-aliased edge every pixel is a
 * slightly different blend, so no two are equal and everything ties at one vote.
 * Bucketing puts colors a person would call the same into one pile.
 */

/**
 * How coarsely colors are bucketed: 5 bits per channel, so 32 levels each and a
 * step of 8. Coarse enough that a region's pixels land together despite the small
 * variations of a photograph or a JPEG's compression, fine enough that two colors
 * a person would call different never share a bucket.
 */
export const BUCKET_BITS = 5;
/** Levels per channel — the range each of a bucket's three coordinates spans. */
export const BUCKET_LEVELS = 1 << BUCKET_BITS;
export const BUCKET_COUNT = 1 << (BUCKET_BITS * 3);

const CHANNEL_SHIFT = 8 - BUCKET_BITS;

/** Packs a color into its bucket number: 5 bits of each channel, red highest. */
export const bucketOf = (r: number, g: number, b: number) =>
  ((r >> CHANNEL_SHIFT) << (BUCKET_BITS * 2)) |
  ((g >> CHANNEL_SHIFT) << BUCKET_BITS) |
  (b >> CHANNEL_SHIFT);

/** Unpacks a bucket number back into its three coordinates, each 0 to 31. */
export const bucketRed = (bucket: number) => bucket >> (BUCKET_BITS * 2);
export const bucketGreen = (bucket: number) => (bucket >> BUCKET_BITS) & (BUCKET_LEVELS - 1);
export const bucketBlue = (bucket: number) => bucket & (BUCKET_LEVELS - 1);

/** Packs three coordinates back into a bucket number. */
export const bucketAt = (red: number, green: number, blue: number) =>
  (red << (BUCKET_BITS * 2)) | (green << BUCKET_BITS) | blue;

/**
 * The vote counts and the mark of which buckets won, allocated once for the whole
 * app rather than per domino — 32768 entries is far too much to build tens of
 * thousands of times.
 *
 * Shared mutable scratch is safe here for the same reason dominoes/modeller.tsx's
 * scratch matrix is: a mapping run looks at one patch at a time, start to finish,
 * on the one thread JavaScript gives us. `releaseTally` is what keeps the promise
 * that both arrays are all zeroes when the next patch starts, and it clears only
 * the buckets that were actually used — zeroing all 32768 per domino would cost
 * more than the entire rest of the run.
 */
const votes = new Float64Array(BUCKET_COUNT);
const chosen = new Uint8Array(BUCKET_COUNT);
const usedBuckets: number[] = [];

export interface BucketTally {
  /**
   * Alpha-weighted vote count per bucket. Only the entries listed in `used` are
   * non-zero. Valid until releaseTally.
   */
  votes: Float64Array;
  /** Every bucket holding at least one pixel, in the order they were first met. */
  used: readonly number[];
}

/**
 * Counts the patch's pixels into buckets, or returns null when there is nothing
 * usable there — no pixels at all, or a patch that is mostly transparent, so a
 * picture with a see-through background does not paint its own empty space.
 *
 * Votes are weighted by how opaque each pixel is, so a half-faded pixel counts
 * half. That is the same treatment the average gives them, and it stops a soft
 * edge against a transparent background out-voting the solid color behind it.
 *
 * Every successful call must be paired with releaseTally.
 */
export function tallyPatchBuckets(pixels: ImageData, bounds: PatchBounds): BucketTally | null {
  const { width, data } = pixels;
  const { firstX, firstY, lastX, lastY } = bounds;

  let alphaSum = 0;
  let pixelCount = 0;

  for (let y = firstY; y <= lastY; y++) {
    let offset = (y * width + firstX) * 4;
    for (let x = firstX; x <= lastX; x++) {
      const alpha = data[offset + 3];
      alphaSum += alpha;
      pixelCount++;
      if (alpha > 0) {
        const bucket = bucketOf(data[offset], data[offset + 1], data[offset + 2]);
        if (votes[bucket] === 0) usedBuckets.push(bucket);
        votes[bucket] += alpha;
      }
      offset += 4;
    }
  }

  if (pixelCount === 0 || usedBuckets.length === 0) {
    releaseTally();
    return null;
  }
  if (alphaSum / (pixelCount * 255) < MIN_OPAQUE_FRACTION) {
    releaseTally();
    return null;
  }

  return { votes, used: usedBuckets };
}

/** Marks a bucket as one the answer should be averaged over. */
export function chooseBucket(bucket: number) {
  chosen[bucket] = 1;
}

/**
 * The average color of the pixels in whichever buckets were chosen.
 *
 * This second pass is what keeps the buckets purely a way of *counting*. Without
 * it the answer would be quantised to the middle of a bucket, a step of 8 per
 * channel, which is enough to push a borderline domino onto the wrong inventory
 * color.
 */
export function averageChosenBuckets(
  pixels: ImageData,
  bounds: PatchBounds,
): SampledColor | null {
  const { width, data } = pixels;
  const { firstX, firstY, lastX, lastY } = bounds;

  let red = 0;
  let green = 0;
  let blue = 0;
  let alphaSum = 0;

  for (let y = firstY; y <= lastY; y++) {
    let offset = (y * width + firstX) * 4;
    for (let x = firstX; x <= lastX; x++) {
      const alpha = data[offset + 3];
      if (alpha > 0 && chosen[bucketOf(data[offset], data[offset + 1], data[offset + 2])] === 1) {
        red += data[offset] * alpha;
        green += data[offset + 1] * alpha;
        blue += data[offset + 2] * alpha;
        alphaSum += alpha;
      }
      offset += 4;
    }
  }

  if (alphaSum === 0) return null;
  return { r: red / alphaSum, g: green / alphaSum, b: blue / alphaSum };
}

/** Returns the shared arrays to all-zeroes, ready for the next patch. */
export function releaseTally() {
  for (const bucket of usedBuckets) {
    votes[bucket] = 0;
    chosen[bucket] = 0;
  }
  usedBuckets.length = 0;
}
