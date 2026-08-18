import { readableTextColor, rgbBytesToHex } from "../color";
import { DEFAULT_DOMINO_COLOR, isHiddenColorId } from "../dominoes/object-model";
import { dominoFootprintHalfExtents } from "../dominoes/footprint";
import { useDominoDataStore } from "../dominoes/store";
import { compareColor, type InventoryEntry } from "../domino-inventory/object-model";
import { getDominoRowCol } from "../object-types/registry";
import type { DDObject } from "../object-types/registry";

/**
 * Turning a DDObject's dominoes into the one shape both printed build plans are
 * generated from.
 *
 * This is the only place that reads the domino columns, resolves colours, or
 * decides which way up the page is. Both documents work from what it produces,
 * so they can never disagree about a colour number or a row number.
 *
 * ---- Where the geometry comes from ----
 *
 * Nothing here reconstructs a grid. Two things the element type already
 * publishes answer two different questions, and keeping them apart is the point:
 *
 *   - `DominoData.positions` — where each domino actually is, in millimetres,
 *     written by the type's own modeller when it laid the element out. Together
 *     with dominoes/footprint.ts's `dominoFootprintHalfExtents` (how much room
 *     each domino owns) that gives the printed picture its shape, at the true
 *     proportions the canvas draws — a field's cell is about twice as tall as it
 *     is wide, and nothing here computes that ratio; it falls out of the real
 *     measurements.
 *
 *   - `dominoRowCol` — what a domino is *called*. Row and column numbers on the
 *     page, where the division rules fall, and the order the sort plan walks in.
 *
 * A future element type that lays its dominoes out in rings or a spiral needs no
 * new code here for the first of those: its modeller has already written the
 * positions. (It would need a rotation, which `DominoData` has no column for
 * today — `orientations` is standing/sideways/flat with no angle.)
 */

/** One colour used somewhere in the element, as the legend lists it. */
export interface PlanColor {
  /**
   * What is printed inside each domino and beside the legend swatch.
   *
   * Unassigned is **0** and the real colours count up from 1, so the numbers a
   * builder reads are the colours they actually have to fetch. This is
   * deliberately not the same thing as the colour's position in `colors` — see
   * PlanDomino.colorIndex, which is.
   */
  number: number;
  /** The inventory entry's `colorName`, or "Unassigned". */
  name: string;
  hex: string;
  /** Black or white, whichever stays readable on `hex`. */
  textColor: string;
  count: number;
}

/** One domino, placed on the page and named. */
export interface PlanDomino {
  /** Plan coordinates: row 0 is the TOP row, column 0 the LEFT one. */
  row: number;
  col: number;
  /**
   * Index into PlanModel.colors, or **-1** for a hidden domino — a gap.
   *
   * Kept separate from the printed `PlanColor.number` because the two stopped
   * agreeing when Unassigned took the number 0: as an index, 0 is a perfectly
   * ordinary colour, so it could no longer double as the "no domino here"
   * sentinel. -1 can never be a valid index, so it can.
   */
  colorIndex: number;
  /** Millimetres from the plan's top-left corner; y grows DOWN, as a page does. */
  x: number;
  y: number;
  /** The room this domino owns, in millimetres. */
  w: number;
  h: number;
}

export interface PlanModel {
  ddObjectName: string;
  dominoes: PlanDomino[];
  rows: number;
  cols: number;
  /** The whole element's printed size, in millimetres at 1:1. */
  widthMm: number;
  heightMm: number;
  /** Indexed by `PlanDomino.colorIndex`. Unassigned, when present, is first. */
  colors: PlanColor[];
  /** Dominoes that will actually be set up — hidden ones excluded. */
  totalDominoes: number;
  skipCount: number;
}

/** The legend name for a domino with no colour chosen, and for a deleted one. */
const UNASSIGNED_NAME = "Unassigned";

/**
 * Derived from the colour an unpainted domino actually renders as, the same way
 * designer/dominoSwatches.ts derives its Unassigned swatch — so the plan, the
 * swatch panel and the build plane cannot drift apart.
 */
const UNASSIGNED_HEX = rgbBytesToHex(DEFAULT_DOMINO_COLOR);

/** The key used for unassigned dominoes in the tally below. */
const UNASSIGNED_KEY = 0;

/**
 * Builds the plan model, or returns null when this DDObject cannot produce one —
 * its type does not name its dominoes by row and column, or it has no dominoes.
 * The build plane is excluded by exactly that test, rather than by naming it.
 */
export function buildPlanModel(
  ddObject: DDObject,
  inventoryEntries: readonly InventoryEntry[],
): PlanModel | null {
  const rowColOf = getDominoRowCol(ddObject);
  if (!rowColOf) return null;

  const data = useDominoDataStore.getState().get(ddObject.id);
  if (!data || data.count === 0) return null;

  const half = dominoFootprintHalfExtents(ddObject);

  // Look up by numericId across *every* entry, active or not: an inventory
  // colour can be deactivated while dominoes still carry it, and the canvas goes
  // on drawing those dominoes in it (colorLookupStore builds its table from all
  // entries too). The plan must show what the build plane shows.
  const entryByNumericId = new Map<number, InventoryEntry>();
  for (const entry of inventoryEntries) entryByNumericId.set(entry.numericId, entry);

  // First pass: name every domino, tally the colours, and measure the element.
  // The tally is keyed by numericId, with 0 standing for "no colour" — which
  // covers both an unpainted domino and one painted with a colour that has since
  // been deleted from the inventory, since `rgbById` misses in exactly the same
  // way and both draw in DEFAULT_DOMINO_COLOR.
  interface Placed {
    row: number;
    col: number;
    colorKey: number;
    hidden: boolean;
    centreX: number;
    centreY: number;
  }

  const placed: Placed[] = [];
  const tally = new Map<number, { hex: string; name: string; count: number }>();

  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let skipCount = 0;

  for (let i = 0; i < data.count; i++) {
    const { row, col } = rowColOf(i);
    const storedColorId = data.colorIds[i];
    const hidden = isHiddenColorId(storedColorId);

    let colorKey = UNASSIGNED_KEY;
    if (hidden) {
      skipCount++;
    } else {
      const entry = entryByNumericId.get(storedColorId);
      colorKey = entry ? entry.numericId : UNASSIGNED_KEY;
      const existing = tally.get(colorKey);
      if (existing) {
        existing.count++;
      } else {
        tally.set(colorKey, {
          hex: entry ? entry.color : UNASSIGNED_HEX,
          name: entry ? entry.colorName : UNASSIGNED_NAME,
          count: 1,
        });
      }
    }

    const centreX = data.positions[3 * i];
    const centreY = data.positions[3 * i + 1];

    placed.push({ row, col, colorKey, hidden, centreX, centreY });

    if (row < minRow) minRow = row;
    if (row > maxRow) maxRow = row;
    if (col < minCol) minCol = col;
    if (col > maxCol) maxCol = col;
    if (centreX - half.left < minX) minX = centreX - half.left;
    if (centreX + half.right > maxX) maxX = centreX + half.right;
    if (centreY - half.down < minY) minY = centreY - half.down;
    if (centreY + half.up > maxY) maxY = centreY + half.up;
  }

  // Real colours are ordered by the inventory's own "sort by color" — the same
  // comparator the inventory table's Color column uses, reused rather than
  // reimplemented, so the two orderings can never diverge.
  //
  // Unassigned is pulled out and put first, numbered 0, so the numbers a builder
  // has to go and fetch start at 1. Left in the sort it would land somewhere
  // among the greys and push a real colour's number up by one. When there is
  // nothing unassigned it is simply absent, and the numbering starts at 1 with
  // no gap.
  const unassigned = tally.get(UNASSIGNED_KEY);
  const realColors = [...tally.entries()]
    .filter(([key]) => key !== UNASSIGNED_KEY)
    .sort((a, b) => compareColor(a[1].hex, b[1].hex));

  const ordered = unassigned
    ? ([[UNASSIGNED_KEY, unassigned], ...realColors] as typeof realColors)
    : realColors;

  const colors: PlanColor[] = ordered.map(([key, value], index) => ({
    // The printed number and the position in this array are different things:
    // Unassigned prints as 0 while sitting at index 0, so every real colour's
    // number is its index, not its index plus one.
    number: key === UNASSIGNED_KEY ? 0 : (unassigned ? index : index + 1),
    name: value.name,
    hex: value.hex,
    textColor: readableTextColor(value.hex),
    count: value.count,
  }));

  const indexByColorKey = new Map<number, number>();
  ordered.forEach(([key], index) => indexByColorKey.set(key, index));

  // Second pass: place each domino on the page.
  //
  // Two flips happen here and nowhere else, and getting either backwards mirrors
  // both documents:
  //
  //   - Rows. A fieldElement's row 0 is its *bottom* row, so the visual top row
  //     is the highest row number. Plan row 0 is the top one, which is what the
  //     user counts from when reading "Rows 1-10" off a page header.
  //   - Y. The build plane's Y grows upwards; a printed page's grows downwards.
  const dominoes: PlanDomino[] = placed.map((p) => ({
    row: maxRow - p.row,
    col: p.col - minCol,
    colorIndex: p.hidden ? -1 : (indexByColorKey.get(p.colorKey) ?? -1),
    x: p.centreX - half.left - minX,
    y: maxY - (p.centreY + half.up),
    w: half.left + half.right,
    h: half.down + half.up,
  }));

  return {
    ddObjectName: ddObject.name,
    dominoes,
    rows: maxRow - minRow + 1,
    cols: maxCol - minCol + 1,
    widthMm: maxX - minX,
    heightMm: maxY - minY,
    colors,
    totalDominoes: data.count - skipCount,
    skipCount,
  };
}