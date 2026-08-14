import { patternDither } from "./pattern";

/**
 * A random-looking nudge per domino, with no pattern to it — grain rather than
 * crosshatch.
 *
 * Where Bayer breaks up banding with a regular weave, this breaks it up with
 * noise. Which one suits a picture is a matter of taste: the weave is tidier and
 * reads as a deliberate texture, the grain is less obtrusive at a distance and
 * never fights the shapes in the picture with a competing pattern of its own.
 */

/**
 * Turns a row and column into a number from 0 up to (but not including) 1,
 * scrambled so that neighbouring dominoes get unrelated values.
 *
 * **It has to be worked out from the coordinates, and must never be
 * Math.random().** Pressing Map Colors twice with the same settings has to give
 * the same field both times, or there is no way to judge whether a change of
 * metric or of strength improved anything — the picture would come out different
 * either way. Everything else in this app leans on that too: the same reasoning
 * is why a mapping run can be cancelled and repeated at all.
 *
 * The mixing below is the usual trick for it. Math.imul multiplies two numbers
 * as 32-bit whole numbers, throwing away the overflow instead of losing
 * precision the way ordinary multiplication would; shifting the high bits down
 * and combining them back in with ^ (exclusive-or, a bit-by-bit "one or the
 * other but not both") spreads every input bit across the whole result, so
 * coordinates one apart land nowhere near each other.
 */
function hashToUnit(row: number, col: number): number {
  // The third constant keeps row 0, column 0 from hashing to a plain zero, which
  // would otherwise always take the largest nudge in the dark direction.
  let h = Math.imul(row, 0x27d4eb2d) ^ Math.imul(col, 0x165667b1) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 15), 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 16;
  // >>> 0 reads the 32 bits back as a positive number rather than a signed one.
  return (h >>> 0) / 4294967296;
}

export const randomDither = patternDither(
  "random",
  "Random",
  (row, col) => hashToUnit(row, col) - 0.5,
);