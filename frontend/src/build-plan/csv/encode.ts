import { csvRow, LINE_END, UTF8_BOM } from "../../csv";
import type { PlanModel } from "../model";
import { PLAN_GAP, planColorIndexGrid } from "../planGrid";

/**
 * Writing the layout out as a spreadsheet.
 *
 * The same picture the printed Layout plan draws, as data rather than as a page:
 * the grid with its rows and columns numbered, the legend under it, and the
 * totals under that. It exists so a design can be worked on somewhere else —
 * counted, re-ordered, priced, or handed to someone who does not have the app.
 *
 * Pure, and paper-free by construction: a CSV has no pages, so unlike the Layout
 * plan there is nothing here about cell sizes, page breaks or orientation. That
 * also makes this the whole of the document, with no emit step beside it.
 */

export function encodeLayoutCsv(model: PlanModel): string {
  const cells = planColorIndexGrid(model);
  const lines: string[] = [];

  // The grid. Rows and columns are numbered from 1 at the upper left, which is
  // where a builder reads them from and what the printed plan's page headers
  // say. PlanDomino.row/col are already 0-based with row 0 the top row and
  // col 0 the left one — model.ts does both flips — so this is just plus one.
  //
  // The corner cell is empty: it heads the row numbers, and they have no name.
  const columnNumbers: string[] = [""];
  for (let col = 0; col < model.cols; col++) columnNumbers.push(String(col + 1));
  lines.push(csvRow(columnNumbers));

  for (let row = 0; row < model.rows; row++) {
    const base = row * model.cols;
    const cellsInRow: string[] = [String(row + 1)];
    for (let col = 0; col < model.cols; col++) {
      const colorIndex = cells[base + col];
      // An empty cell for a hidden domino or a position holding none. It cannot
      // be a 0: that is Unassigned's own legend number, and a real colour a
      // builder has to leave blank on the floor.
      cellsInRow.push(
        colorIndex === PLAN_GAP ? "" : String(model.colors[colorIndex].number),
      );
    }
    lines.push(csvRow(cellsInRow));
  }

  // The legend, in the order model.ts settled: Unassigned first as 0 when there
  // is any, then the real colours sorted by the inventory's own comparator. The
  // hex is here and not on the printed legend, where the swatch says it better
  // than six characters could.
  lines.push("");
  lines.push(csvRow(["Legend"]));
  lines.push(csvRow(["No.", "Color", "Hex", "Count"]));
  for (const color of model.colors) {
    lines.push(
      csvRow([String(color.number), color.name, color.hex, String(color.count)]),
    );
  }

  // The same totals the printed legend page ends with, each one a single value
  // in the first column so it reads as a sentence rather than as data.
  lines.push("");
  lines.push(csvRow([`Total dominoes: ${model.totalDominoes}`]));
  if (model.skipCount > 0) {
    lines.push(csvRow([`Gaps (no domino): ${model.skipCount}`]));
  }
  lines.push(csvRow([`${model.rows} rows × ${model.cols} columns`]));

  return UTF8_BOM + lines.join(LINE_END) + LINE_END;
}