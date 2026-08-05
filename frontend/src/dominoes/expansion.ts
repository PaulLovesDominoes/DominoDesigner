import { useStore } from "../store";
import { getDominoExpansion } from "../object-types/registry";
import type { DDObjectId, DominoExpansion } from "../object-types/base";

/**
 * Resolves domino editing mode's Expand toggle against the element type's own
 * `dominoExpansion` (object-types/base.ts), so the two consumers that must agree
 * about how big a domino currently is — dominoes/modeller.tsx, which draws it,
 * and designer/DominoEditTool.tsx, which hit-tests it — read the answer from one
 * place. If they disagreed, a rubber band would visibly cut through a domino
 * without taking it, and a direct click (which raycasts the real, drawn mesh)
 * would pick a domino a drag over the same spot would miss.
 */

/** No growth: what everything outside the mode, and every non-expanding type, gets. */
export const NO_DOMINO_EXPANSION: DominoExpansion = {
  x0: 0,
  x1: 0,
  y0: 0,
  y1: 0,
  z0: 0,
  z1: 0,
};

/**
 * How much `ddObjectId`'s dominoes are currently grown — all zeroes unless the
 * Expand toggle is on, this is the element actually being domino-edited, and its
 * type declares an expansion for it. Returning the zero record rather than null
 * keeps the per-domino loops in both consumers branch-free.
 *
 * Imperative on purpose: it builds a fresh object, so using it as a `useStore`
 * selector would make useSyncExternalStore treat every render as a store change
 * (React error #185 — see CLAUDE.md on getDDObjectBounds and useShallow).
 * Subscribe to the primitives instead — `dominoExpanded`, `dominoEditingId`,
 * `ddObjects[id]` — and call this.
 */
export function resolveDominoExpansion(ddObjectId: DDObjectId): DominoExpansion {
  const s = useStore.getState();
  if (!s.dominoExpanded || s.dominoEditingId !== ddObjectId) return NO_DOMINO_EXPANSION;
  const ddObject = s.ddObjects[ddObjectId];
  if (!ddObject) return NO_DOMINO_EXPANSION;
  return getDominoExpansion(ddObject) ?? NO_DOMINO_EXPANSION;
}