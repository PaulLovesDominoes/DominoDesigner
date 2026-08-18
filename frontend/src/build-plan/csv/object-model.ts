import { RiFileExcelLine } from "@remixicon/react";

import type { BuildPlanDefinition } from "../base";
import { downloadTextFile, safeFileName } from "../download";
import type { PlanModel } from "../model";
import { encodeLayoutCsv } from "./encode";
import CsvPlanEditor from "./options";

/**
 * The CSV export: the layout as a spreadsheet rather than as a printed page.
 *
 * The first plan that is saved rather than printed, which is what the
 * `actionLabel`/`deliver` pair on BuildPlanDefinition exists for — the options
 * dialog reads both and so needs no idea that this plan is different in kind
 * from the two beside it.
 */

/**
 * The CSV has nothing to set. It has no paper, so no orientation, no page size
 * and no pagination; the dividers mean nothing to a spreadsheet, which has its
 * own; and the grid's shape is the element's. So the panel shows what the file
 * will hold instead of offering settings.
 */
export type CsvPlanOptions = Record<string, never>;

const CSV_DEFAULT_OPTIONS: CsvPlanOptions = {};

export const csvPlanDefinition: BuildPlanDefinition<CsvPlanOptions> = {
  id: "csv",
  menuLabel: "Export CSV",
  icon: RiFileExcelLine,
  title: "Export CSV",
  defaultOptions: CSV_DEFAULT_OPTIONS,
  Options: CsvPlanEditor,
  documentTitle: (model) => `Layout — ${model.ddObjectName}`,
  render: (model) => encodeLayoutCsv(model),
  actionLabel: "Download CSV",
  deliver: (document, model) =>
    downloadTextFile(document, csvFileName(model), "text/csv;charset=utf-8"),
};

/**
 * Named after the element, so several fields exported in a row do not overwrite
 * one another in the downloads folder.
 */
function csvFileName(model: PlanModel): string {
  return `${safeFileName(model.ddObjectName)} Layout.csv`;
}