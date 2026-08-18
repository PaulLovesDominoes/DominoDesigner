import { getDDObjectBounds } from "../object-types/registry";
import type { DDObject } from "../object-types/registry";
import type { DominoData } from "../dominoes/object-model";
import { dominoFootprintHalfExtents } from "../dominoes/footprint";
import { imageOriginFor, imageWorldRect, type DominoImageMap } from "./object-model";

/**
 * Which dominoes a picture actually lies over.
 *
 * Two callers, and they must agree: mapping.ts, which reads a patch of picture
 * per domino, and the panel, which tells the user how many dominoes a run will
 * fill before they press the button. A count that disagreed with the run would
 * be worse than no count at all.
 */

/**
 * Builds a test for "does the picture reach this domino", or returns undefined
 * when the element has no footprint or nowhere to put a picture.
 *
 * Everything the test needs is worked out once, here, and the returned function
 * is then a few comparisons per domino — which matters, since it is run over
 * every domino in the field.
 *
 * ---- What this agrees with the run about, and what it does not ----
 *
 * The **geometry is exact**, not an approximation. mapping.ts decides a domino
 * is out of reach when resolvePatchBounds returns null, and that test — once the
 * millimetres-to-pixels factors are cancelled out — is precisely the overlap
 * test below. resolvePatchBounds does round each patch outward to whole pixels,
 * but only *after* deciding whether it overlaps at all, so the rounding chooses
 * which pixels get read and never which dominoes get reached.
 *
 * What this does **not** know about is **transparency**. Every patch sampler
 * returns null for a patch less than MIN_OPAQUE_FRACTION opaque, so a run leaves
 * that domino unassigned; this is pure geometry and never reads a pixel. For a
 * photograph the two agree exactly. For artwork on a transparent background they
 * can differ a great deal — a wordmark on a wide canvas covers most dominoes by
 * rectangle and colours only the ones under the ink.
 *
 * That is a deliberate limit rather than an oversight. Knowing which patches are
 * opaque enough means summing alpha over every pixel of every patch, which is
 * the picture's whole pixel buffer — affordable once, but this is recomputed
 * while the picture is being dragged.
 */
export function makeDominoUnderImageTest(
  ddObject: DDObject,
  image: DominoImageMap,
  data: DominoData,
): ((flatIndex: number) => boolean) | undefined {
  const bounds = getDDObjectBounds(ddObject);
  const origin = imageOriginFor(ddObject);
  if (!bounds || !origin) return undefined;

  const rect = imageWorldRect(image, origin);
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  const half = dominoFootprintHalfExtents(ddObject);
  const rectRight = rect.x + rect.width;
  const rectTop = rect.y + rect.height;

  return (flatIndex: number) => {
    if (flatIndex >= data.count) return false;
    // DominoData positions are relative to the element's position, which
    // bounds.x/y is — so this puts the domino's centre on the build plane, the
    // same space the picture's rectangle is in.
    const centreX = bounds.x + data.positions[3 * flatIndex];
    const centreY = bounds.y + data.positions[3 * flatIndex + 1];
    return (
      centreX + half.right > rect.x &&
      centreX - half.left < rectRight &&
      centreY + half.up > rect.y &&
      centreY - half.down < rectTop
    );
  };
}