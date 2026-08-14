/**
 * Turning the patch of picture a domino covers into a range of whole pixels to
 * read. Shared by every variant, so none of them range-checks anything and all
 * of them agree about which pixels belong to a domino.
 */

/** A rectangle of image pixels, both ends included, guaranteed inside the image. */
export interface PatchBounds {
  firstX: number;
  firstY: number;
  lastX: number;
  lastY: number;
}

/**
 * Clamps a patch to the image and rounds it out to whole pixels, or returns null
 * when it misses the image entirely.
 *
 * Coordinates are in pixels with x running right and **y running down**, the way
 * image rows are stored — the caller flips build-plane Y, which runs up.
 *
 * The rectangle is allowed to hang off the image, since a picture may be
 * positioned so that only part of it lies over the dominoes; only the
 * overlapping part is read.
 */
export function resolvePatchBounds(
  pixels: ImageData,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): PatchBounds | null {
  const { width, height } = pixels;
  if (maxX <= 0 || minX >= width || maxY <= 0 || minY >= height) return null;

  const firstX = Math.max(0, Math.floor(minX));
  const firstY = Math.max(0, Math.floor(minY));
  // Math.max against the first index covers a patch smaller than one pixel,
  // which happens whenever the picture is scaled up past its own resolution:
  // without it the range would come out empty and the domino would be skipped.
  const lastX = Math.min(width - 1, Math.max(firstX, Math.ceil(maxX) - 1));
  const lastY = Math.min(height - 1, Math.max(firstY, Math.ceil(maxY) - 1));

  return { firstX, firstY, lastX, lastY };
}