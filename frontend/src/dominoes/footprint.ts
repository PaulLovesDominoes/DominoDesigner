import { DOMINO_SIZE } from "../dimensions";
import { getDominoExpansion } from "../object-types/registry";
import type { DDObject } from "../object-types/registry";

/**
 * How much build plane a domino owns, as a half-extent on each side of its
 * centre.
 *
 * The element type answers this for itself through `dominoExpansion` — the same
 * member the Expand toggle uses. For a field it is half the spacing on each
 * side, which makes a domino's share exactly one pitch, so the shares tile the
 * grid with no gaps and no overlap.
 *
 * Note this is the raw registry accessor and NOT dominoes/expansion.ts's
 * resolveDominoExpansion, which deliberately reports zeroes unless the user has
 * Expand switched on. Neither of the things that read this — what a mapping run
 * samples off a picture, and how big a domino is drawn on a printed build plan —
 * may depend on a view toggle.
 *
 * The pairing is easy to get backwards: a domino's `thickness` runs along X and
 * its `width` along Y, matching the field's pitchX/pitchY.
 */
export function dominoFootprintHalfExtents(ddObject: DDObject) {
  const room = getDominoExpansion(ddObject);
  return {
    left: DOMINO_SIZE.thickness / 2 + (room?.x0 ?? 0),
    right: DOMINO_SIZE.thickness / 2 + (room?.x1 ?? 0),
    down: DOMINO_SIZE.width / 2 + (room?.y0 ?? 0),
    up: DOMINO_SIZE.width / 2 + (room?.y1 ?? 0),
  };
}