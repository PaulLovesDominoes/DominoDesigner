/**
 * The shared machinery behind the Bayer dithers (bayer4.ts, bayer8.ts). Not a
 * registered variant itself — the same arrangement lab.ts has, where the maths
 * two metrics share sits in its own module and each registered entry stays a
 * thin file.
 *
 * An *ordered* dither takes its nudge from a small square of numbers laid over
 * the grid and repeated, so the pattern is fixed and regular rather than random.
 * Bayer's particular square is built to spread its values as evenly as possible:
 * neighbouring cells hold numbers far apart in the ordering, which is what makes
 * the result read as a fine crosshatch rather than as clumps.
 */

/**
 * Builds a Bayer matrix of the given size, which must be a power of two.
 *
 * It is defined by doubling: start from the 2x2 square below, and to double the
 * size, place four copies of the current square in a 2x2 arrangement, multiply
 * every value by 4, and add the 2x2 square's value for whichever copy it is.
 * That is what keeps the values spread out at every scale.
 *
 * The result holds each whole number from 0 to size*size - 1 exactly once.
 */
function buildBayerMatrix(size: number): number[][] {
  let matrix = [
    [0, 2],
    [3, 1],
  ];

  while (matrix.length < size) {
    const half = matrix.length;
    const doubled: number[][] = [];
    for (let row = 0; row < half * 2; row++) {
      doubled.push(new Array<number>(half * 2));
    }
    for (let row = 0; row < half; row++) {
      for (let col = 0; col < half; col++) {
        const base = matrix[row][col] * 4;
        doubled[row][col] = base + 0;
        doubled[row][col + half] = base + 2;
        doubled[row + half][col] = base + 3;
        doubled[row + half][col + half] = base + 1;
      }
    }
    matrix = doubled;
  }

  return matrix;
}

/**
 * A Bayer matrix rescaled so its values run from just below -0.5 up to just
 * below +0.5, evenly spaced and centred on zero.
 *
 * Centring matters: an offset that was always positive would lighten the whole
 * picture rather than dither it, and the mapping would come out visibly paler
 * than the image.
 */
function buildOffsetMatrix(size: number): number[][] {
  const bayer = buildBayerMatrix(size);
  const steps = size * size;
  return bayer.map((row) => row.map((value) => (value + 0.5) / steps - 0.5));
}

/**
 * Makes the pattern function for a Bayer dither of the given size — the
 * `PatternAt` pattern.ts takes. Built once at module load, so a mapping run does
 * two array lookups per domino.
 */
export function orderedPatternAt(size: number) {
  const offsets = buildOffsetMatrix(size);
  return (row: number, col: number) =>
    // Modulo on its own goes negative for a negative row or column, which cannot
    // happen for a flat index but can once a type maps its dominoes to
    // coordinates of its own. Adding size before the second modulo costs
    // nothing and makes the pattern well defined either way.
    offsets[((row % size) + size) % size][((col % size) + size) % size];
}