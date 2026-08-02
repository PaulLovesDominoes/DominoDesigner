import type { DominoColorClipboardItem } from "./clipboardItem";
import type { DominoSelectionEntry } from "./selectionStore";
import {
  getDominoIndexAt,
  getDominoRowCol,
  getPasteDominoColorsOverride,
  type DDObject,
} from "../object-types/registry";

/** What a paste resolves to: which dominoes to recolor, and to what. */
export type DominoColorPasteResult = Array<[index: number, colorId: number]>;

/**
 * Lay a copied pattern of domino colors onto a destination element, using both
 * elements' row/column-like mappings (base.ts's dominoRowCol/dominoIndexAt).
 *
 * One implementation for every element type, in both directions: the source and
 * destination are only ever touched through those two hooks, so a field can
 * paste into a spiral and vice versa with no code here knowing either exists.
 * That's why step 1 is a *capability* check and never a type check.
 *
 * The geometry, matching what the user specified:
 * - The pattern's upper-left corner is correlated with the destination
 *   selection's upper-left corner, "upper-left" being (max row, min col) per
 *   dominoRowCol's orientation contract.
 * - A single selected destination domino stamps the whole pattern from there.
 * - A larger selection tiles the pattern across it and a smaller one truncates
 *   it — both fall out of one modulo, since a destination narrower than the
 *   pattern simply never wraps.
 * - Cells of the source's bounding box that weren't copied (an L-shaped or
 *   scattered selection) are holes, and holes write nothing: the destination
 *   domino keeps whatever color it had.
 * - Only dominoes actually in the destination selection are written, so an
 *   arbitrarily-shaped destination is honored rather than filled to its
 *   bounding box.
 *
 * Pure — returns the changes rather than applying them, so the caller can push
 * a single undoable operation. Returns undefined when there is nothing to do.
 */
export function rowColPaste(
  item: DominoColorClipboardItem,
  destDDObject: DDObject,
  selected: Set<number>,
  destCount: number,
): DominoColorPasteResult | undefined {
  if (item.indices.length === 0 || selected.size === 0) return undefined;

  const srcRowCol = getDominoRowCol(item.sourceDDObject);
  const dstRowCol = getDominoRowCol(destDDObject);
  const dstIndexAt = getDominoIndexAt(destDDObject);
  if (!srcRowCol || !dstRowCol || !dstIndexAt) return undefined;

  // ── Decode the copied pattern, in the SOURCE's coordinates ──
  let srcMinRow = Infinity;
  let srcMaxRow = -Infinity;
  let srcMinCol = Infinity;
  let srcMaxCol = -Infinity;
  const srcCells: Array<{ row: number; col: number; colorId: number }> = [];
  for (let k = 0; k < item.indices.length; k++) {
    const { row, col } = srcRowCol(item.indices[k]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue; // degenerate source layout
    srcCells.push({ row, col, colorId: item.colorIds[k] });
    if (row < srcMinRow) srcMinRow = row;
    if (row > srcMaxRow) srcMaxRow = row;
    if (col < srcMinCol) srcMinCol = col;
    if (col > srcMaxCol) srcMaxCol = col;
  }
  if (srcCells.length === 0) return undefined;

  const patternHeight = srcMaxRow - srcMinRow + 1;
  const patternWidth = srcMaxCol - srcMinCol + 1;
  // Keyed on the pattern's own coordinates, counted DOWN from its top-left, so
  // it can be laid over the destination's top-left directly. Sparse: a missing
  // key is a hole.
  const pattern = new Map<number, number>();
  for (const cell of srcCells) {
    const pr = srcMaxRow - cell.row;
    const pc = cell.col - srcMinCol;
    pattern.set(pr * patternWidth + pc, cell.colorId);
  }

  // ── Find the destination's correlation corner, in ITS coordinates ──
  const dstCells: Array<{ index: number; row: number; col: number }> = [];
  let dstMaxRow = -Infinity;
  let dstMinCol = Infinity;
  for (const index of selected) {
    if (index >= destCount) continue; // selection left stale by a shrink
    const { row, col } = dstRowCol(index);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    dstCells.push({ index, row, col });
    if (row > dstMaxRow) dstMaxRow = row;
    if (col < dstMinCol) dstMinCol = col;
  }
  if (dstCells.length === 0) return undefined;

  const result: DominoColorPasteResult = [];

  if (dstCells.length === 1) {
    // Single destination domino: stamp the whole pattern from it. This is the
    // one path that has to *find* dominoes rather than iterate given ones,
    // hence dstIndexAt — and hence the type's control over what happens at the
    // edge, since an undefined here drops that cell (a field clips; a ring type
    // would wrap instead).
    const anchor = dstCells[0];
    for (let pr = 0; pr < patternHeight; pr++) {
      for (let pc = 0; pc < patternWidth; pc++) {
        const colorId = pattern.get(pr * patternWidth + pc);
        if (colorId === undefined) continue; // hole in the source
        const index = dstIndexAt(anchor.row - pr, anchor.col + pc);
        if (index === undefined || index >= destCount) continue; // off the element
        result.push([index, colorId]);
      }
    }
  } else {
    // A region: tile the pattern across it, writing only to dominoes actually
    // selected. Both operands are non-negative by construction (dstMaxRow is
    // the maximum row, dstMinCol the minimum column), so no negative-modulo
    // trap. A destination smaller than the pattern never reaches the wrap and
    // is therefore truncated, which is the same expression doing both jobs.
    for (const cell of dstCells) {
      const pr = (dstMaxRow - cell.row) % patternHeight;
      const pc = (cell.col - dstMinCol) % patternWidth;
      const colorId = pattern.get(pr * patternWidth + pc);
      if (colorId === undefined) continue; // hole in the source
      result.push([cell.index, colorId]);
    }
  }

  return result.length > 0 ? result : undefined;
}

/**
 * How a paste actually gets resolved: the destination type's own
 * `pasteDominoColors` if it declares one, otherwise the generic rowColPaste
 * above. Nothing declares an override today — it exists so a type whose paste
 * semantics genuinely differ isn't forced into corner-correlation-plus-tiling.
 */
export function resolveDominoColorPaste(
  item: DominoColorClipboardItem,
  destDDObject: DDObject,
  selection: DominoSelectionEntry,
  destCount: number,
): DominoColorPasteResult | undefined {
  const override = getPasteDominoColorsOverride(destDDObject);
  return override
    ? override(item, selection)
    : rowColPaste(item, destDDObject, selection.selected, destCount);
}

/**
 * Whether `destDDObject` could accept a domino-color paste at all — the
 * capability behind the Paste command's enabled state. Deliberately cheap: it
 * asks only whether the mappings (or an override) exist, not whether this
 * particular item would produce any change.
 */
export function canPasteDominoColors(destDDObject: DDObject): boolean {
  if (getPasteDominoColorsOverride(destDDObject)) return true;
  return !!getDominoRowCol(destDDObject) && !!getDominoIndexAt(destDDObject);
}