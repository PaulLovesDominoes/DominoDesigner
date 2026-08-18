/**
 * Paper the plans are laid out for.
 *
 * A printed plan needs its page in millimetres, not "whatever the printer has":
 * fitting dominoes to a page and guaranteeing their numbers stay readable is
 * arithmetic, and `@page { size: auto }` leaves nothing to do that arithmetic
 * with. So the size is asked for, and the generated document declares it.
 *
 * The ids are the labels the user sees, so `SelectField` — which works in plain
 * display strings — can take them with nothing mapping back and forth.
 */

export type PaperSizeId = "Letter" | "A4" | "Legal" | "A3";
export type PageOrientation = "Portrait" | "Landscape";

/** Portrait width and height in millimetres. */
const PAPER_SIZES: Record<PaperSizeId, { widthMm: number; heightMm: number }> = {
  Letter: { widthMm: 215.9, heightMm: 279.4 },
  A4: { widthMm: 210, heightMm: 297 },
  Legal: { widthMm: 215.9, heightMm: 355.6 },
  A3: { widthMm: 297, heightMm: 420 },
};

export const PAPER_SIZE_OPTIONS = Object.keys(PAPER_SIZES) as PaperSizeId[];
export const PAGE_ORIENTATION_OPTIONS: PageOrientation[] = ["Portrait", "Landscape"];

/**
 * Margin left around the printable area, on all four sides.
 *
 * The generated document sets `@page { margin: 0 }` and applies this as padding
 * inside the page box instead. Letting the browser keep its own margin as well
 * would add a second one on top of ours and quietly falsify every measurement
 * the layout makes.
 */
export const PAGE_MARGIN_MM = 10;

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  marginMm: number;
  printableWidthMm: number;
  printableHeightMm: number;
}

export function pageGeometry(
  paper: PaperSizeId,
  orientation: PageOrientation,
): PageGeometry {
  const size = PAPER_SIZES[paper];
  const widthMm = orientation === "Landscape" ? size.heightMm : size.widthMm;
  const heightMm = orientation === "Landscape" ? size.widthMm : size.heightMm;
  return {
    widthMm,
    heightMm,
    marginMm: PAGE_MARGIN_MM,
    printableWidthMm: widthMm - 2 * PAGE_MARGIN_MM,
    printableHeightMm: heightMm - 2 * PAGE_MARGIN_MM,
  };
}