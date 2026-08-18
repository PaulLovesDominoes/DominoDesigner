import { legendHtml, mm, pageHeaderHtml, planDocument } from "../html";
import type { PlanDomino } from "../model";
import { EDGE_BLEED_MM, type PaginatedLayout } from "./paginate";

/**
 * Turning a paginated layout into a printable document.
 *
 * Each page is drawn as one inline SVG in millimetres. SVG rather than a grid of
 * HTML boxes for three reasons, and the third is the one that matters longest:
 *
 *   - One exact coordinate system. Every domino, rule and number is placed in
 *     printed millimetres, so what the pagination worked out is what appears.
 *   - The thick division rules are just lines. Drawn as borders on the cells
 *     they would shrink the cells they landed on, making the grid uneven; drawn
 *     as lines they sit over the top and change nothing.
 *   - It prints as vectors at the printer's own resolution, and an element type
 *     that lays its dominoes out in rings or a spiral would need rotated and
 *     curved marks, which SVG already draws. Nothing about that would need a
 *     different document format.
 */

/** Hairline round each domino, so the grid reads as cells even in one colour. */
const CELL_STROKE_MM = 0.08;
const MAJOR_RULE_MM = 1.0;
const MINOR_RULE_MM = 0.45;
/** The grid's own outline, where no division falls on it. */
const BORDER_RULE_MM = 0.5;

/**
 * Lays the dominoes out by plan row and column so each page can pick out its own
 * window without walking all of them again. A missing entry is simply a position
 * with no domino, which draws as nothing.
 */
function indexByRowCol(plan: PaginatedLayout): Array<PlanDomino | undefined> {
  const cells: Array<PlanDomino | undefined> = new Array(
    plan.model.rows * plan.model.cols,
  );
  for (const domino of plan.model.dominoes) {
    cells[domino.row * plan.model.cols + domino.col] = domino;
  }
  return cells;
}

function pageSvg(
  plan: PaginatedLayout,
  page: PaginatedLayout["pages"][number],
  cells: Array<PlanDomino | undefined>,
): string {
  const { scale, numberFontMm } = plan.capacity;
  const { colStartMm, rowStartMm } = plan.tracks;
  const widthMm = page.windowWidthMm * scale;
  const heightMm = page.windowHeightMm * scale;

  const rects: string[] = [];
  const numbers: string[] = [];

  for (let row = page.rowStart; row < page.rowEnd; row++) {
    for (let col = page.colStart; col < page.colEnd; col++) {
      const domino = cells[row * plan.model.cols + col];
      if (!domino) continue;

      const x = (domino.x - page.originXMm) * scale;
      const y = (domino.y - page.originYMm) * scale;
      const w = domino.w * scale;
      const h = domino.h * scale;
      const color = plan.model.colors[domino.colorIndex];

      // A hidden domino is a gap in the field: outlined so the hole is visible
      // in the grid, but with no fill and no number to read.
      rects.push(
        `<rect x="${mm(x)}" y="${mm(y)}" width="${mm(w)}" height="${mm(h)}" fill="${
          color ? color.hex : "none"
        }"/>`,
      );
      if (color && numberFontMm > 0) {
        numbers.push(
          `<text x="${mm(x + w / 2)}" y="${mm(y + h / 2)}" fill="${color.textColor}">${
            color.number
          }</text>`,
        );
      }
    }
  }

  // Division rules *inside* this page. Counted from the whole plan's origin, so
  // the thick rules land on the same numbers the page header prints.
  const rules: string[] = [];
  for (let col = page.colStart + 1; col < page.colEnd; col++) {
    const width = ruleWidth(col, plan.options.majorCols, plan.options.minorCols);
    if (!width) continue;
    const x = (colStartMm[col] - page.originXMm) * scale;
    rules.push(
      `<line x1="${mm(x)}" y1="0" x2="${mm(x)}" y2="${mm(heightMm)}" stroke-width="${width}"/>`,
    );
  }
  for (let row = page.rowStart + 1; row < page.rowEnd; row++) {
    const width = ruleWidth(row, plan.options.majorRows, plan.options.minorRows);
    if (!width) continue;
    const y = (rowStartMm[row] - page.originYMm) * scale;
    rules.push(
      `<line x1="0" y1="${mm(y)}" x2="${mm(widthMm)}" y2="${mm(y)}" stroke-width="${width}"/>`,
    );
  }

  // The four edges. Each carries its own division's weight where one lands on
  // it, so a template ending exactly at the edge of a sheet says so — the whole
  // point being to show a builder that it does not continue overleaf. Where no
  // division falls there it is just the grid's outline.
  //
  // All four rather than only the trailing pair: the right edge of one sheet and
  // the left edge of the next are the *same* boundary, and they have to match
  // when the sheets are laid side by side.
  const edge = (index: number, major: number, minor: number) =>
    Math.max(BORDER_RULE_MM, ruleWidth(index, major, minor));

  const { majorCols, minorCols, majorRows, minorRows } = plan.options;
  const left = edge(page.colStart, majorCols, minorCols);
  const right = edge(page.colEnd, majorCols, minorCols);
  const top = edge(page.rowStart, majorRows, minorRows);
  const bottom = edge(page.rowEnd, majorRows, minorRows);

  rules.push(
    `<line x1="0" y1="0" x2="0" y2="${mm(heightMm)}" stroke-width="${left}"/>`,
    `<line x1="${mm(widthMm)}" y1="0" x2="${mm(widthMm)}" y2="${mm(
      heightMm,
    )}" stroke-width="${right}"/>`,
    `<line x1="0" y1="0" x2="${mm(widthMm)}" y2="0" stroke-width="${top}"/>`,
    `<line x1="0" y1="${mm(heightMm)}" x2="${mm(widthMm)}" y2="${mm(
      heightMm,
    )}" stroke-width="${bottom}"/>`,
  );

  // An SVG stroke straddles the line it sits on, so an edge rule would lose its
  // outer half off the side of the drawing. The bleed is room for that half; the
  // content is shifted in by the same amount so the grid still starts where the
  // pagination put it. resolveCapacity takes the same allowance off the page, so
  // this cannot push the grid past the margin.
  const b = EDGE_BLEED_MM;
  const outerW = widthMm + 2 * b;
  const outerH = heightMm + 2 * b;

  return `<svg width="${mm(outerW)}mm" height="${mm(outerH)}mm" viewBox="0 0 ${mm(
    outerW,
  )} ${mm(outerH)}" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(${mm(b)} ${mm(b)})">
      <g stroke="#888" stroke-width="${CELL_STROKE_MM}">${rects.join("")}</g>
      <g font-size="${mm(numberFontMm)}" text-anchor="middle" dominant-baseline="central"
         font-family="Arial, sans-serif">${numbers.join("")}</g>
      <g stroke="#000">${rules.join("")}</g>
    </g>
  </svg>`;
}

/**
 * How thick the rule before this row or column is, or 0 for an ordinary cell
 * edge. Major wins where a boundary is both, which is why it is tested first.
 */
function ruleWidth(index: number, major: number, minor: number): number {
  if (major >= 1 && index % Math.floor(major) === 0) return MAJOR_RULE_MM;
  if (minor >= 1 && index % Math.floor(minor) === 0) return MINOR_RULE_MM;
  return 0;
}

export function emitLayoutHtml(plan: PaginatedLayout): string {
  const cells = indexByRowCol(plan);
  const name = plan.model.ddObjectName;

  const legendPage = `<section class="page">${legendHtml(plan.model)}</section>`;

  const gridPages = plan.pages
    .map(
      (page) =>
        `<section class="page">${pageHeaderHtml(name, page.label)}` +
        `<div class="grid">${pageSvg(plan, page, cells)}</div></section>`,
    )
    .join("");

  return planDocument({
    title: `Layout — ${name}`,
    geometry: plan.geometry,
    styles: `
      .grid { line-height: 0; }
      svg { display: block; }
    `,
    body: legendPage + gridPages,
  });
}