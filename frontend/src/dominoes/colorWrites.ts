import type { DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import type { UndoEdit } from "../history/appStoreSlice";
import { useDominoDataStore } from "./store";
import { syncDominoColorMemory } from "./colorMemory";
import type { DominoData } from "./object-model";

/**
 * The one write path for a batch of domino color changes.
 *
 * It lives in a module of its own rather than inside dominoes/appStoreSlice.ts
 * because two slices need it now — the colour slice for swatches, cut and paste,
 * and image-map's for a colour-mapping run — and store.ts must stay the only
 * module that enters the slice import cycle. Same move ddObjectOps.ts made for
 * history, and for the same reason.
 */

/**
 * The one variant of UndoEdit this file produces. Named so commitDominoColors
 * can return it precisely rather than as the whole union — a paint stroke and a
 * mapping run both read the indices/before columns straight off what it returns,
 * which the union cannot answer for.
 */
export type DominoColorsUndoEdit = Extract<UndoEdit, { kind: "dominoColors" }>;

/**
 * Writes `targets` into the parent's colorIds column: filter to the dominoes
 * that actually change, mutate in place, signal the change, and keep the
 * cross-regenerate color memory in step.
 *
 * Returns the UndoEdit to push, or null when nothing actually changed, so no
 * empty undo step gets recorded (re-applying the colour a domino already has
 * adds nothing to the history). It doesn't push itself — callers are inside
 * `set` and do that.
 *
 * The syncDominoColorMemory call is not optional: skipping it lets a later
 * regenerate resurrect a color that was just cut or overwritten. See that
 * function's own doc comment for the full failure mode.
 */
export function commitDominoColors(
  parentId: DDObjectId,
  ddObject: DDObject | undefined,
  data: DominoData,
  targets: Iterable<[index: number, colorId: number]>,
): DominoColorsUndoEdit | null {
  const indices: number[] = [];
  const before: number[] = [];
  const after: number[] = [];
  for (const [i, colorId] of targets) {
    // i >= count: a selection left stale by a shrink.
    if (i >= data.count) continue;
    if (data.colorIds[i] === colorId) continue; // already this color
    indices.push(i);
    before.push(data.colorIds[i]);
    after.push(colorId);
  }
  if (indices.length === 0) return null;

  for (let k = 0; k < indices.length; k++) data.colorIds[indices[k]] = after[k];
  useDominoDataStore.getState().bump(parentId);

  const afterArray = Uint32Array.from(after);
  if (ddObject) syncDominoColorMemory(ddObject, indices, afterArray);

  return {
    kind: "dominoColors",
    parentId,
    indices: Uint32Array.from(indices),
    before: Uint32Array.from(before),
    after: afterArray,
  };
}