import type { PlanModel } from "../model";
import type { SortPlanOptions } from "./object-model";

/**
 * Turning the plan model into the run-length rows the sort plan prints.
 *
 * This is the whole of the document's content, worked out with no reference to
 * paper at all — pagination happens later and by measurement, because a row's
 * runs wrap to a number of lines nothing can predict from here. That makes this
 * the piece a second backend would share, and the measuring the piece it would
 * have to do for itself.
 */

/** One stretch of the same colour along a row. */
export interface SortRun {
  /** Index into PlanModel.colors, or -1 for a gap where no domino stands. */
  colorIndex: number;
  /** The colour's name, or "skip" for a gap. */
  label: string;
  count: number;
}

export interface SortRow {
  /** Counted from 1 at the top, the same way the layout's page headers count. */
  number: number;
  /**
   * One entry per template-load when batching is on, and exactly one entry
   * holding the whole row when it is off.
   */
  batches: SortRun[][];
  /** Dominoes and gaps together — what the row occupies, not what it uses. */
  slots: number;
}

/**
 * Lowercase deliberately, so that scanning down a column of counts never mistakes
 * a gap for a colour called "Skip".
 */
const SKIP_LABEL = "skip";

/** PlanDomino.colorIndex for a hidden domino, and for a position holding none. */
const GAP = -1;

export function encodeSortRows(
  model: PlanModel,
  options: SortPlanOptions,
): SortRow[] {
  // Lay the dominoes out by row and column once, pre-filled with the same -1
  // that marks a hidden domino. A position with no domino at all then reads the
  // same as a hidden one with no second array to track it — which is right, since
  // from a builder's point of view both are a tooth of the template left empty.
  const cells = new Int32Array(model.rows * model.cols).fill(GAP);
  for (const domino of model.dominoes) {
    cells[domino.row * model.cols + domino.col] = domino.colorIndex;
  }

  const batchSize =
    options.batching && options.batchSize >= 1 ? Math.floor(options.batchSize) : 0;

  const rows: SortRow[] = [];

  for (let row = 0; row < model.rows; row++) {
    const base = row * model.cols;

    // Gaps at the end of a row are dropped — the row simply stops there. Gaps
    // before and between dominoes are kept, because someone loading a template
    // has to know which teeth to leave empty.
    let length = model.cols;
    while (length > 0 && cells[base + length - 1] === GAP) length--;
    if (length === 0) continue;

    const batches: SortRun[][] = [];
    let batch: SortRun[] = [];
    let run: SortRun | null = null;

    for (let col = 0; col < length; col++) {
      // A gap still occupies a slot in the template, so batch boundaries are
      // counted in positions rather than in dominoes.
      if (batchSize > 0 && col > 0 && col % batchSize === 0) {
        if (run) batch.push(run);
        run = null;
        batches.push(batch);
        batch = [];
      }

      const colorIndex = cells[base + col];

      if (run && run.colorIndex === colorIndex) {
        run.count++;
        continue;
      }
      if (run) batch.push(run);
      run = {
        colorIndex,
        label: model.colors[colorIndex]?.name ?? SKIP_LABEL,
        count: 1,
      };
    }

    if (run) batch.push(run);
    if (batch.length > 0) batches.push(batch);

    rows.push({ number: row + 1, batches, slots: length });
  }

  return rows;
}