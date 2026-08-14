import { MIN_OPAQUE_FRACTION, type PatchSampleDefinition } from "./base";

/**
 * The average color over the patch — the right answer for photographs.
 *
 * Averaging rather than reading the single pixel at the patch's centre is what
 * stops a detailed picture turning into noise: a centre sample picks whichever
 * speck of the image happened to land there, where an average gives the color
 * that area actually reads as.
 *
 * It is also nearly free. The patches tile the field without overlapping, so
 * across a whole run each source pixel is visited about once however many
 * dominoes there are.
 */
export const averagePatchSample: PatchSampleDefinition = {
  id: "average",
  label: "Average",

  sample: (pixels, bounds) => {
    const { width, data } = pixels;
    const { firstX, firstY, lastX, lastY } = bounds;

    let red = 0;
    let green = 0;
    let blue = 0;
    let alphaSum = 0;
    let pixelCount = 0;

    for (let y = firstY; y <= lastY; y++) {
      let offset = (y * width + firstX) * 4;
      for (let x = firstX; x <= lastX; x++) {
        const alpha = data[offset + 3];
        // Weighting by alpha keeps a soft edge from dragging the average towards
        // whatever colour the transparent pixels happen to carry, which for a
        // PNG is often black.
        red += data[offset] * alpha;
        green += data[offset + 1] * alpha;
        blue += data[offset + 2] * alpha;
        alphaSum += alpha;
        pixelCount++;
        offset += 4;
      }
    }

    if (pixelCount === 0) return null;
    if (alphaSum / (pixelCount * 255) < MIN_OPAQUE_FRACTION) return null;

    return { r: red / alphaSum, g: green / alphaSum, b: blue / alphaSum };
  },
};