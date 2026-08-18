import type { PlanModel } from "../model";
import { pageGeometry, type PageGeometry } from "../paper";
import type { LayoutPlanOptions, PageBreakRule } from "./object-model";

/**
 * Working out how much of the field goes on one sheet, and where the thick and
 * thin division rules fall.
 *
 * Everything here is pure arithmetic over the plan model — no markup. That is
 * the seam a PDF backend would slot into later: it would consume exactly what
 * this produces and sit beside emitHtml.ts, with nothing in this file changing.
 *
 * ---- Legibility drives capacity, not the other way round ----
 *
 * The number inside each domino is how a builder tells two near-identical
 * colours apart while sorting and checking, so it is never dropped and never
 * shrunk past reading size. That makes the smallest readable cell the *input* to
 * how many dominoes fit on a page, rather than something sacrificed to fit more
 * on. In Auto mode that is the whole calculation. In Manual mode the user's
 * counts win and we say so when the result would be too small, rather than
 * silently overriding them.
 */

/** Smallest number height that still reads reliably in print — about 7.4pt. */
const MIN_NUMBER_FONT_MM = 2.6;

/** Roughly how wide a digit is relative to its height, in a normal UI font. */
const DIGIT_ASPECT = 0.62;

/** Clear space kept either side of the number inside its domino. */
const NUMBER_PADDING_MM = 0.5;

/** Room reserved at the top of each page for its header line. */
export const HEADER_HEIGHT_MM = 8;

/**
 * How large a domino is ever printed.
 *
 * Without a ceiling, a small field on a big sheet grows until it fills the page:
 * a 10 x 5 field on Letter came out at 19.6mm per domino, a handful of giant
 * squares with nothing gained. The cap applies in every pagination mode.
 */
const MAX_CELL_WIDTH_MM = 8;

/**
 * Room left round the grid for the page-edge rules.
 *
 * An SVG stroke straddles the line it is drawn on, so an edge rule centred on
 * the boundary loses its outer half to the edge of the drawing. Half the
 * heaviest rule is exactly what it needs on each side.
 */
export const EDGE_BLEED_MM = 0.6;

/** Slack for the "how many fit" divisions — see `fitsAt` for why it is needed. */
const FIT_EPS = 1e-6;

/**
 * Where each plan row and column sits, measured off the dominoes themselves
 * rather than assumed to be a regular grid.
 *
 * A field is regular, so every column comes out the same width — but taking the
 * measurements means a ragged element type (some rows shorter than others) still
 * paginates and draws correctly, and nothing here has to know which it is
 * looking at.
 */
export interface Tracks {
  /** Millimetres, model space. Indexed by plan column. */
  colStartMm: Float64Array;
  colEndMm: Float64Array;
  /** Indexed by plan row. */
  rowStartMm: Float64Array;
  rowEndMm: Float64Array;
  /** The widest column and tallest row — what capacity is worked out from. */
  cellWidthMm: number;
  cellHeightMm: number;
}

function measureTracks(model: PlanModel): Tracks {
  const colStartMm = new Float64Array(model.cols).fill(Infinity);
  const colEndMm = new Float64Array(model.cols).fill(-Infinity);
  const rowStartMm = new Float64Array(model.rows).fill(Infinity);
  const rowEndMm = new Float64Array(model.rows).fill(-Infinity);

  for (const domino of model.dominoes) {
    if (domino.x < colStartMm[domino.col]) colStartMm[domino.col] = domino.x;
    if (domino.x + domino.w > colEndMm[domino.col]) {
      colEndMm[domino.col] = domino.x + domino.w;
    }
    if (domino.y < rowStartMm[domino.row]) rowStartMm[domino.row] = domino.y;
    if (domino.y + domino.h > rowEndMm[domino.row]) {
      rowEndMm[domino.row] = domino.y + domino.h;
    }
  }

  // A row or column with no dominoes in it at all would still be spanned by the
  // page it falls in, so give it zero width rather than leaving it infinite.
  let cellWidthMm = 0;
  for (let col = 0; col < model.cols; col++) {
    if (!Number.isFinite(colStartMm[col])) {
      colStartMm[col] = 0;
      colEndMm[col] = 0;
    }
    cellWidthMm = Math.max(cellWidthMm, colEndMm[col] - colStartMm[col]);
  }
  let cellHeightMm = 0;
  for (let row = 0; row < model.rows; row++) {
    if (!Number.isFinite(rowStartMm[row])) {
      rowStartMm[row] = 0;
      rowEndMm[row] = 0;
    }
    cellHeightMm = Math.max(cellHeightMm, rowEndMm[row] - rowStartMm[row]);
  }

  return { colStartMm, colEndMm, rowStartMm, rowEndMm, cellWidthMm, cellHeightMm };
}

/** How many dominoes a page boundary must be a multiple of. */
function breakStep(rule: PageBreakRule, major: number, minor: number): number {
  if (rule === "Any") return 1;
  const step = rule === "Major" ? major : Math.min(major, minor);
  return step >= 1 ? Math.floor(step) : 1;
}

/**
 * How many dominoes a page holds, given how many fit and how many exist.
 *
 * Rounded **down** to a whole division so a page never cuts one in half, unless
 * the whole element fits, in which case it takes all of it.
 */
function perPageDown(fits: number, total: number, step: number): number {
  if (fits >= total) return total;
  return Math.max(step, Math.floor(fits / step) * step);
}

/**
 * The other direction: the smallest whole number of divisions that still covers
 * `needed`. Used when the page count is already decided and the question is how
 * few dominoes a page may hold without adding one — rounding down there would
 * let an extra page appear.
 */
function perPageUp(needed: number, total: number, step: number): number {
  if (needed >= total) return total;
  return Math.max(step, Math.ceil(needed / step) * step);
}

/**
 * Splits `total` dominoes into page-sized runs, each a whole number of divisions
 * so a page never cuts one in half.
 *
 * `Math.max(step, ...)` is what keeps this making progress when a division is
 * wider than a page will hold: such a page carries one oversized division rather
 * than the loop taking zero columns forever.
 */
function pageCuts(total: number, perPage: number, step: number): Array<[number, number]> {
  // Never split what already fits. Without this, rounding down to a whole
  // division would cut a field of 55 columns into 40 + 15 even after the
  // capacity above worked out that all 55 fit on the sheet.
  if (perPage >= total) return [[0, total]];

  const take = Math.max(step, Math.floor(perPage / step) * step);
  const cuts: Array<[number, number]> = [];
  for (let start = 0; start < total; start += take) {
    cuts.push([start, Math.min(start + take, total)]);
  }
  return cuts;
}

export interface LayoutCapacity {
  /** Printed millimetres per millimetre of real build plane. */
  scale: number;
  cellWidthMm: number;
  cellHeightMm: number;
  numberFontMm: number;
  colsPerPage: number;
  rowsPerPage: number;
  /** How small a cell may get before its number stops being readable. */
  minCellWidthMm: number;
  /** Set when the chosen settings put the numbers below that floor. */
  legibilityWarning: string | null;
}

export interface LayoutPage {
  pageRow: number;
  pageCol: number;
  /** Plan indices, `start` inclusive and `end` exclusive. */
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  label: string;
  /** The model-space window this page shows, in millimetres before scaling. */
  originXMm: number;
  originYMm: number;
  windowWidthMm: number;
  windowHeightMm: number;
}

export interface PaginatedLayout {
  model: PlanModel;
  options: LayoutPlanOptions;
  geometry: PageGeometry;
  capacity: LayoutCapacity;
  tracks: Tracks;
  pages: LayoutPage[];
}

/**
 * Works out the cell size and how many rows and columns fit on a page, without
 * yet deciding where the page boundaries land. Split out from `paginateLayout`
 * because the options dialog shows these figures live as the user types, and has
 * no use for the page list.
 */
export function resolveCapacity(
  model: PlanModel,
  options: LayoutPlanOptions,
): LayoutCapacity {
  const geometry = pageGeometry(options.paper, options.orientation);
  const tracks = measureTracks(model);

  // The bleed comes off both axes: the edge rules are drawn outside the grid, so
  // the grid itself has that much less room than the printable area.
  const gridWidthMm = geometry.printableWidthMm - 2 * EDGE_BLEED_MM;
  const gridHeightMm =
    geometry.printableHeightMm - HEADER_HEIGHT_MM - 2 * EDGE_BLEED_MM;

  // The widest number that will be printed decides the narrowest a cell may be.
  // Unassigned prints as 0 and the rest count from 1, so the largest number is
  // one less than the colour count whenever Unassigned is present.
  const highestNumber = model.colors.reduce((n, color) => Math.max(n, color.number), 0);
  const digits = String(Math.max(1, highestNumber)).length;
  const minCellWidthMm =
    digits * MIN_NUMBER_FONT_MM * DIGIT_ASPECT + 2 * NUMBER_PADDING_MM;

  const colStep = breakStep(options.colBreak, options.majorCols, options.minorCols);
  const rowStep = breakStep(options.rowBreak, options.majorRows, options.minorRows);

  // Guard against a degenerate element with no measurable footprint.
  if (tracks.cellWidthMm <= 0 || tracks.cellHeightMm <= 0) {
    return {
      scale: 1,
      cellWidthMm: 0,
      cellHeightMm: 0,
      numberFontMm: MIN_NUMBER_FONT_MM,
      colsPerPage: model.cols,
      rowsPerPage: model.rows,
      minCellWidthMm,
      legibilityWarning: null,
    };
  }

  // The smallest cell whose number still reads. Everything starts from here,
  // because it is the size that fits the most on a page.
  const minScale = minCellWidthMm / tracks.cellWidthMm;

  // How large a cell may be before the 8mm ceiling stops it.
  const maxScale = MAX_CELL_WIDTH_MM / tracks.cellWidthMm;

  /**
   * How many columns and rows fit at a given scale.
   *
   * `FIT_EPS` is not a fudge factor, and dropping it costs a whole page. The
   * growth step below picks a scale at which exactly `neededCols` fill the
   * width — but dividing the width back by that cell size lands on
   * 59.999999999999996 rather than 60, which floors to 59, loses a whole
   * division, and pushes a two-page layout onto three. The slack is far smaller
   * than any real difference in fit and far larger than the rounding error.
   * fieldElement's `GEOMETRY_EPS` exists for the same reason in `fitCount`.
   */
  const fitsAt = (scale: number) => ({
    cols: Math.max(1, Math.floor(gridWidthMm / (tracks.cellWidthMm * scale) + FIT_EPS)),
    rows: Math.max(1, Math.floor(gridHeightMm / (tracks.cellHeightMm * scale) + FIT_EPS)),
  });

  /** The largest scale at which a page still holds `cols` by `rows`. */
  const scaleHolding = (cols: number, rows: number) =>
    Math.min(
      gridWidthMm / (cols * tracks.cellWidthMm),
      gridHeightMm / (rows * tracks.cellHeightMm),
    );

  let scale: number;
  let colsPerPage: number;
  let rowsPerPage: number;
  let legibilityWarning: string | null = null;

  if (options.pagination === "Paginate Manually") {
    colsPerPage = Math.max(1, Math.floor(options.colsPerPage));
    rowsPerPage = Math.max(1, Math.floor(options.rowsPerPage));
    scale = Math.min(scaleHolding(colsPerPage, rowsPerPage), maxScale);
  } else if (options.pagination === "Fit to Pages") {
    // The page counts are what the user asked for, so the cell size is derived
    // from them: work out the fewest dominoes a page must hold to reach the
    // requested count, rounded **up** to a whole division (rounding down would
    // need one more page than was asked for), and size the cell to hold that.
    const pagesWide = Math.max(1, Math.floor(options.pagesWide));
    const pagesLong = Math.max(1, Math.floor(options.pagesLong));
    const neededCols = perPageUp(
      Math.ceil(model.cols / pagesWide),
      model.cols,
      colStep,
    );
    const neededRows = perPageUp(
      Math.ceil(model.rows / pagesLong),
      model.rows,
      rowStep,
    );
    scale = Math.min(scaleHolding(neededCols, neededRows), maxScale);

    // Then **fill each page as far as it will go** at that size, rather than
    // spreading the element evenly over the pages asked for. Only one axis can
    // bind the cell size, so the other is usually left with room to spare — and
    // an even spread wastes it: 86 dominoes over two pages came out 43/43 with
    // space for 64 on each, where filling gives 60/26 and puts the whole of the
    // first page to use. The leftovers land on the last page, which is what a
    // builder working left to right expects.
    //
    // This cannot overrun the request: the scale above already guarantees at
    // least `neededCols` fit, and `neededCols` is a whole number of divisions,
    // so flooring what fits can only land on or above it.
    const room = fitsAt(scale);
    colsPerPage = perPageDown(room.cols, model.cols, colStep);
    rowsPerPage = perPageDown(room.rows, model.rows, rowStep);
  } else {
    // Automatic, and the whole of the rule is: settle the page count at the
    // smallest legible cell — which is the fewest pages possible — then grow the
    // cell as far as that same page count allows.
    //
    // Growing without this second step is what left the grid ending short of the
    // right margin: the scale stayed at the legibility floor however much room
    // was going spare. Growing without the page-count guard would be the
    // opposite mistake, silently turning a one-sheet layout into two.
    const atMin = fitsAt(minScale);
    const fewestPagesWide = Math.ceil(
      model.cols / perPageDown(atMin.cols, model.cols, colStep),
    );
    const fewestPagesLong = Math.ceil(
      model.rows / perPageDown(atMin.rows, model.rows, rowStep),
    );

    // The fewest dominoes a page may hold and still land on that page count.
    const neededCols = perPageUp(
      Math.ceil(model.cols / fewestPagesWide),
      model.cols,
      colStep,
    );
    const neededRows = perPageUp(
      Math.ceil(model.rows / fewestPagesLong),
      model.rows,
      rowStep,
    );

    scale = Math.max(minScale, Math.min(scaleHolding(neededCols, neededRows), maxScale));

    const grown = fitsAt(scale);
    colsPerPage = perPageDown(grown.cols, model.cols, colStep);
    rowsPerPage = perPageDown(grown.rows, model.rows, rowStep);
  }

  const cellWidthMm = tracks.cellWidthMm * scale;
  const cellHeightMm = tracks.cellHeightMm * scale;

  if (cellWidthMm < minCellWidthMm - 1e-6) {
    const legibleCols = Math.max(1, Math.floor(gridWidthMm / minCellWidthMm));
    legibilityWarning =
      `At ${colsPerPage} dominoes across, each is ${cellWidthMm.toFixed(1)}mm wide and ` +
      `its number will be too small to read. About ${legibleCols} across is the most ` +
      `this page size can show legibly.`;
  }

  // Sized to the number, then held back by the cell it has to sit in.
  const numberFontMm = Math.min(
    cellHeightMm * 0.7,
    Math.max(0, cellWidthMm - 2 * NUMBER_PADDING_MM) / (digits * DIGIT_ASPECT),
  );

  return {
    scale,
    cellWidthMm,
    cellHeightMm,
    numberFontMm,
    colsPerPage,
    rowsPerPage,
    minCellWidthMm,
    legibilityWarning,
  };
}

export function paginateLayout(
  model: PlanModel,
  options: LayoutPlanOptions,
): PaginatedLayout {
  const geometry = pageGeometry(options.paper, options.orientation);
  const tracks = measureTracks(model);
  const capacity = resolveCapacity(model, options);

  const colStep = breakStep(options.colBreak, options.majorCols, options.minorCols);
  const rowStep = breakStep(options.rowBreak, options.majorRows, options.minorRows);

  const colRuns = pageCuts(model.cols, capacity.colsPerPage, colStep);
  const rowRuns = pageCuts(model.rows, capacity.rowsPerPage, rowStep);

  const pages: LayoutPage[] = [];
  rowRuns.forEach(([rowStart, rowEnd], pageRow) => {
    colRuns.forEach(([colStart, colEnd], pageCol) => {
      const originXMm = tracks.colStartMm[colStart];
      const originYMm = tracks.rowStartMm[rowStart];
      pages.push({
        pageRow,
        pageCol,
        rowStart,
        rowEnd,
        colStart,
        colEnd,
        // Both counted from 1, matching what is printed inside the legend and
        // what a builder reads off the grid.
        label:
          `Page ${pageRow + 1}:${pageCol + 1} — ` +
          `Rows ${rowStart + 1}-${rowEnd}, Columns ${colStart + 1}-${colEnd}`,
        originXMm,
        originYMm,
        windowWidthMm: tracks.colEndMm[colEnd - 1] - originXMm,
        windowHeightMm: tracks.rowEndMm[rowEnd - 1] - originYMm,
      });
    });
  });

  return { model, options, geometry, capacity, tracks, pages };
}