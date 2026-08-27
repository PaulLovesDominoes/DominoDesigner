import { DOMINO_SIZE } from "../../../dimensions";
import { boxFootprintBounds, type DominoBox } from "./overlap";

/**
 * Sorting dominoes by where they are, so a question about one spot does not have
 * to be asked of every one of them.
 *
 * **Written for a single caller: leaving out the junction dots that are buried.**
 * That pass asks "is anything standing here?" of every junction on the layer,
 * and a grid can hold forty thousand of them while a structure holds tens of
 * thousands of dominoes. Asked directly that is hundreds of millions of tests,
 * which is not a thing that can be done even once, let alone every time the layer
 * changes.
 *
 * Nothing else here needs it, and nothing else should reach for it. The placement
 * preview asks about one domino against all of them on each movement of the
 * pointer, and the rubber band asks about one rectangle against all of them —
 * both are a single walk through a list of tens of thousands of cheap tests,
 * comfortably inside a frame, and both would have to pay to build one of these
 * first.
 *
 * ## How it works
 *
 * The plane is cut into square cells and each domino is written into every cell
 * its footprint reaches. Asking about a point then means looking in one cell and
 * testing the few dominoes listed there exactly.
 *
 * Cells are a domino-length across. Smaller and a domino would be written into
 * many cells; larger and each cell would list too many to be worth narrowing
 * down. At this size a domino lands in one cell to four, whichever way it is
 * turned.
 */

/** Cells a domino-length square: see the note above on why that size. */
const CELL_MM = DOMINO_SIZE.length;

/**
 * How cell coordinates become one number to look up by.
 *
 * A cell may sit at a negative coordinate — a domino can hang a little off the
 * edge of the build plane — so the coordinates are shifted up before being
 * combined. The span is far wider than any structure, and the result stays a
 * whole number small enough to be compared exactly.
 */
const CELL_ORIGIN = 1024;
const CELL_STRIDE = 4096;
const cellKey = (cellX: number, cellY: number) =>
  (cellY + CELL_ORIGIN) * CELL_STRIDE + (cellX + CELL_ORIGIN);

export interface DominoSpaceIndex {
  /**
   * The dominoes that could be standing on this spot, as indexes into the list
   * the index was built from. A first cut — the caller still has to test each of
   * them exactly.
   */
  near(x: number, y: number): readonly number[];
}

const NONE: readonly number[] = [];

/**
 * Sort a list of dominoes by where their footprints lie.
 *
 * The indexes handed back are into `boxes` as given, so a caller that built its
 * list from a group's own dominoes can read the answer straight back as a
 * position in that group.
 */
export function buildDominoSpaceIndex(
  boxes: readonly DominoBox[],
): DominoSpaceIndex {
  const cells = new Map<number, number[]>();

  for (let i = 0; i < boxes.length; i++) {
    const bounds = boxFootprintBounds(boxes[i]);
    const fromX = Math.floor(bounds.minX / CELL_MM);
    const toX = Math.floor(bounds.maxX / CELL_MM);
    const fromY = Math.floor(bounds.minY / CELL_MM);
    const toY = Math.floor(bounds.maxY / CELL_MM);

    for (let cellX = fromX; cellX <= toX; cellX++) {
      for (let cellY = fromY; cellY <= toY; cellY++) {
        const key = cellKey(cellX, cellY);
        const cell = cells.get(key);
        if (cell) cell.push(i);
        else cells.set(key, [i]);
      }
    }
  }

  return {
    near: (x, y) =>
      cells.get(cellKey(Math.floor(x / CELL_MM), Math.floor(y / CELL_MM))) ??
      NONE,
  };
}