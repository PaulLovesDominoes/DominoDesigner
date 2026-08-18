import { RiLayoutGridLine } from "@remixicon/react";

import type { BuildPlanDefinition } from "../base";
import { openPlanTab } from "../html";
import type { PageOrientation, PaperSizeId } from "../paper";
import { emitLayoutHtml } from "./emitHtml";
import LayoutPlanEditor from "./options";
import { paginateLayout } from "./paginate";

/**
 * The Layout plan: a picture of the element, one cell per domino, in the
 * assigned colours with a legend number inside each. This is the document a
 * builder works from on site.
 */

/**
 * How far a page boundary may fall from the requested dominoes-per-page. A page
 * always ends on one of these, so a division is never cut in half by a page
 * break — the counts are the same strings the user picks from.
 */
export const PAGE_BREAK_RULES = ["Major", "Major or minor", "Any"] as const;
export type PageBreakRule = (typeof PAGE_BREAK_RULES)[number];

/**
 * How many dominoes go on a page.
 *
 * The ids are the labels the user sees, the same convention PAGE_BREAK_RULES and
 * PaperSizeId follow, so `SelectField` takes them with nothing mapping back.
 */
export const PAGINATION_MODES = [
  "Paginate Automatically",
  "Fit to Pages",
  "Paginate Manually",
] as const;
export type PaginationMode = (typeof PAGINATION_MODES)[number];

export interface LayoutPlanOptions {
  /** Thick rules every this many rows / dominoes. */
  majorRows: number;
  majorCols: number;
  /** Thin rules every this many. */
  minorRows: number;
  minorCols: number;
  /**
   * Automatic by default: it works the capacity out from the smallest cell whose
   * number still reads, which is the answer the user would otherwise have to
   * find by printing. The other two modes each read one pair of fields below and
   * ignore the other, so only the pair in use is shown.
   */
  pagination: PaginationMode;
  /** Read only under "Paginate Manually". */
  rowsPerPage: number;
  colsPerPage: number;
  /**
   * Read only under "Fit to Pages", and each may be left blank — null meaning
   * "work this axis out for me", which is the same answer Automatic would give
   * for it. Both blank therefore behaves exactly like "Paginate Automatically",
   * which is where they start.
   */
  pagesWide: number | null;
  pagesLong: number | null;
  rowBreak: PageBreakRule;
  colBreak: PageBreakRule;
  orientation: PageOrientation;
  paper: PaperSizeId;
}

/**
 * A 20-domino template is the common case, so the major column division is one
 * template.
 *
 * Columns break on Major and rows only on Major or minor, and the difference is
 * deliberate: a page ending part-way through a template means carrying a
 * half-loaded template across a page turn, which is the very friction batching
 * exists to remove. A row is not a template, so there is nothing to straddle and
 * the looser rule just wastes less paper. The manual counts below are only a
 * starting point for someone switching Auto off.
 */
const LAYOUT_DEFAULT_OPTIONS: LayoutPlanOptions = {
  majorRows: 10,
  minorRows: 5,
  majorCols: 20,
  minorCols: 10,
  pagination: "Paginate Automatically",
  rowsPerPage: 10,
  colsPerPage: 40,
  pagesWide: null,
  pagesLong: null,
  rowBreak: "Major or minor",
  colBreak: "Major",
  orientation: "Landscape",
  paper: "Letter",
};

export const layoutPlanDefinition: BuildPlanDefinition<LayoutPlanOptions> = {
  id: "layout",
  menuLabel: "Print Layout",
  icon: RiLayoutGridLine,
  title: "Print Layout",
  defaultOptions: LAYOUT_DEFAULT_OPTIONS,
  Options: LayoutPlanEditor,
  documentTitle: (model) => `Layout — ${model.ddObjectName}`,
  render: (model, options) => emitLayoutHtml(paginateLayout(model, options)),
  actionLabel: "Output for Print",
  deliver: (document) => openPlanTab(document),
};