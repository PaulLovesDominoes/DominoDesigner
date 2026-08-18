import type { PlanModel } from "./model";

/**
 * Laying a plan's dominoes out by row and column, which is how both the sort
 * plan and the CSV export read them.
 *
 * Its own module rather than a function in model.ts, for the reason
 * image-map/visibility.ts is split out of image-map/object-model.ts: model.ts
 * imports object-types/registry and the domino stores as *values*, because
 * building a plan means reading them, and that pulls a large part of the app in
 * behind it. This needs none of that — it only walks a model that has already
 * been built — so keeping it separate lets a document reach it cheaply. Note the
 * import above is type-only, which TypeScript erases entirely, so this module
 * depends on nothing at all at runtime.
 */

/** `PlanDomino.colorIndex` for a hidden domino, and for a position holding none. */
export const PLAN_GAP = -1;

/**
 * The dominoes laid out by plan row and column, so a document can pick out a
 * position without walking all of them again.
 *
 * Pre-filled with the same -1 that marks a hidden domino, which means a position
 * holding no domino at all reads identically and needs no second array to track
 * it. That is right rather than merely convenient: to a builder both are an
 * empty slot — a tooth of the template left unloaded.
 */
export function planColorIndexGrid(model: PlanModel): Int32Array {
  const cells = new Int32Array(model.rows * model.cols).fill(PLAN_GAP);
  for (const domino of model.dominoes) {
    cells[domino.row * model.cols + domino.col] = domino.colorIndex;
  }
  return cells;
}