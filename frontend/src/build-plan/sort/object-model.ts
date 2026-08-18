import { RiListOrdered } from "@remixicon/react";

import type { BuildPlanDefinition } from "../base";
import type { PageOrientation, PaperSizeId } from "../paper";
import { emitSortHtml } from "./emitHtml";
import { encodeSortRows } from "./encode";
import SortPlanEditor from "./options";

/**
 * The Sort Plan: each row of the element written out as runs of colour, so the
 * dominoes can be counted into stacks in advance — usually at home, days before
 * anything is set up.
 */

export interface SortPlanOptions {
  /** Mark where one template load ends and the next begins. */
  batching: boolean;
  /** How many teeth the template has. */
  batchSize: number;
  orientation: PageOrientation;
  paper: PaperSizeId;
}

/**
 * The batch size matches the layout's major column division, since both are
 * usually the same template — but they are separate settings, because there is
 * no reason a builder cannot sort against one template and set up with another.
 */
const SORT_DEFAULT_OPTIONS: SortPlanOptions = {
  batching: true,
  batchSize: 20,
  orientation: "Portrait",
  paper: "Letter",
};

export const sortPlanDefinition: BuildPlanDefinition<SortPlanOptions> = {
  id: "sort",
  menuLabel: "Print Sort Plan",
  icon: RiListOrdered,
  title: "Print Sort Plan",
  defaultOptions: SORT_DEFAULT_OPTIONS,
  Options: SortPlanEditor,
  documentTitle: (model) => `Sort Plan — ${model.ddObjectName}`,
  render: (model, options) => emitSortHtml(model, options, encodeSortRows(model, options)),
};