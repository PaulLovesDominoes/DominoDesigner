import type { DominoData } from "../dominoes/object-model";
import type { DominoSelectionEntry } from "../dominoes/selectionStore";
import type { AnyShapeSelectDefinition, SelectionGestureMode, ShapePoint } from "./base";

/**
 * The machinery every shape-select variant's result flows through, kept apart
 * from registry.ts the way ddObjectOps.ts is kept apart from
 * object-types/registry.ts: the registry answers "which variants exist", this
 * answers "what a variant's output means".
 *
 * Nothing here branches on which variant it is holding — that is the whole
 * point of the erased AnyShapeSelectDefinition.
 */

/**
 * Every domino whose MIDPOINT lies inside the shape, ascending.
 *
 * Midpoint, deliberately. The goal of shape selection is a set of dominoes that
 * approximates the shape as closely as possible, and testing each domino's
 * centre is what achieves that. Requiring a domino to be fully enclosed, or
 * accepting any domino the outline merely touches, both give unnecessarily
 * jagged edges. Do not "correct" this to an intersection test against
 * DominoEditor's `footprint()`.
 *
 * This is also why the Expand toggle (dominoes/expansion.ts) — which draws
 * dominoes oversized so tightly-spaced ones are easier to hit — is correctly
 * absent from this whole subsystem: it changes how big a domino is *drawn*, not
 * where its midpoint is, so a shape takes exactly the same dominoes whether it
 * is on or off. The rectangle band's predicates do consult it, because they
 * test against a domino's drawn footprint rather than its centre.
 *
 * Ascending order matters: DominoEditor's sameIndices redraw guard is a plain
 * elementwise compare over these lists.
 */
export function indicesInShape(
  definition: AnyShapeSelectDefinition,
  state: unknown,
  data: DominoData,
): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.count; i++) {
    if (definition.contains(state, data.positions[3 * i], data.positions[3 * i + 1])) {
      result.push(i);
    }
  }
  return result;
}

/**
 * The index among `candidates` nearest physical point (cx, cy) — the bridge
 * from a gesture's continuous mm geometry to the domino *index* Shift+Arrow
 * needs.
 *
 * A gesture defines itself by points, not by dominoes: a rubber band by its
 * press and release, a circle by its centre and its rim. None of those need
 * land on a domino — a press can fall in the gap between two, in the element's
 * margin, or (Ctrl+drag) off the element entirely. But
 * selectionMovingCornerIndex is stepped by nearestInDirection and
 * selectionFixedCornerIndex is measured by rectFromIndices, both of which take
 * indices, so each point has to be snapped onto one.
 *
 * `candidates` is deliberately the gesture's own result rather than every
 * domino: that is what guarantees both corners are members of the set just
 * selected, so the first Shift+Arrow extends from somewhere the user actually
 * swept instead of leaping to a domino outside it.
 */
export function nearestToPoint(
  data: DominoData,
  candidates: number[],
  cx: number,
  cy: number,
): number {
  let best = candidates[0];
  let bestDist = Infinity;
  for (const i of candidates) {
    const dx = data.positions[3 * i] - cx;
    const dy = data.positions[3 * i + 1] - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Turns a set of newly covered domino indices into a selection set: the 
* dominoes by the gesture combined with the pre-gesture selection however
 * `selectionGestureMode` says, also recalculates the two corner indices that a following
 * Shift+Arrow will extend from. Shared verbatim by the rectangle rubber band
 * and every shape, which is what stops the two drifting.
 *
 * `before` is the selection as it stood when the sequence started, captured
 * once at the first press and held for the whole sequence. Ctrl unions onto
 * *that snapshot*, and Alt subtracts from it, rather than either one working on
 * whatever is selected right now — because after the first previewed frame what
 * is selected right now already includes this sequence's own preview, so
 * building on it would accumulate. Snapshotting is what lets the shape grow,
 * shrink and be redrawn freely while only what it covers at this instant counts.
 *
 * The sameIndices redraw guard is deliberately NOT here: it needs the caller's
 * per-sequence `lastIndices`, and keeping it at the two call sites keeps this
 * function pure and out-param-free.
 */
export function selectionFrom(
  data: DominoData,
  indices: number[],
  opts: {
    before: DominoSelectionEntry | undefined;
    selectionGestureMode: SelectionGestureMode;
    selectionFixedCornerPoint: ShapePoint;
    selectionMovingCornerPoint: ShapePoint;
  },
): DominoSelectionEntry {
  const previous = opts.before?.selected ?? new Set<number>();
  let selected: Set<number>;
  let baseSelection: Set<number>;
  if (opts.selectionGestureMode === "add") {
    baseSelection = new Set(previous);
    selected = new Set(baseSelection);
    for (const i of indices) selected.add(i);
  } else if (opts.selectionGestureMode === "remove") {
    selected = new Set(previous);
    for (const i of indices) selected.delete(i);
    // Shift+Arrow refills its rectangle on top of baseSelection, so pointing
    // that at the pre-gesture selection would bring back the very dominoes this
    // gesture just removed. What survived the removal is the honest base.
    baseSelection = new Set(selected);
  } else {
    baseSelection = new Set<number>();
    selected = new Set(indices);
  }

  // Recomputed on every previewed frame rather than once at the end, exactly as
  // the rectangle band already does: the two corners have to stay consistent
  // with the selection currently on screen, since Escape can end the sequence
  // on any frame and leave that preview standing. Both scans are linear over
  // `indices` and allocate nothing.
  //
  // Note nearestToPoint, never Math.min(...selected): spreading a
  // 62,500-element Set creates one argument per element and blows the call
  // stack (see dominoes/appStoreSlice.ts's writeDominoSelection).
  let selectionFixedCornerIndex = opts.before?.selectionFixedCornerIndex ?? 0;
  let selectionMovingCornerIndex = opts.before?.selectionMovingCornerIndex ?? 0;
  // The Fixed and Moving Corners that the arrow keys work from are changed for
  // replace and add only. A remove leaves both where they were: it establishes
  // no new FixedCorner anchor, and `indices` there holds exactly the dominoes
  // that just LEFT the selection, so there is nothing in it a corner should
  // point at.
  if (opts.selectionGestureMode !== "remove" && indices.length > 0) {
    selectionFixedCornerIndex = nearestToPoint(
      data,
      indices,
      opts.selectionFixedCornerPoint.x,
      opts.selectionFixedCornerPoint.y,
    );
    selectionMovingCornerIndex = nearestToPoint(
      data,
      indices,
      opts.selectionMovingCornerPoint.x,
      opts.selectionMovingCornerPoint.y,
    );
  }
  return { selected, baseSelection, selectionFixedCornerIndex, selectionMovingCornerIndex };
}