import type { InventoryEntryId } from "../domino-inventory/object-model";

/**
 * A *swatch* is anything domino editing mode's sidebar offers as a click target:
 * the inventory colors, plus two that aren't colors at all. Everything
 * downstream — the color lock, the apply, the per-swatch menus, the highlight —
 * is keyed by DominoSwatchId so none of them has to care which kind it holds.
 *
 * InventoryEntryId is `INV-${number}`, so the union discriminates on the string
 * itself and needs no tag field. This module is deliberately store-facing only;
 * how a swatch *looks* lives in designer/dominoSwatches.ts.
 */

/** Hides the selection. Never toggles — unhiding is the swatch menu's own command. */
export const HIDE_SWATCH_ID = "hide";

/** Clears the selection back to unpainted, which also unhides it. */
export const UNASSIGNED_SWATCH_ID = "unassigned";

export type DominoSwatchId =
  | InventoryEntryId
  | typeof HIDE_SWATCH_ID
  | typeof UNASSIGNED_SWATCH_ID;

/**
 * How a swatch menu's selection command combines the dominoes matching the
 * swatch with what's already selected: Select, Add Select, Deselect, and
 * Deselect others respectively.
 */
export type DominoSelectMode = "replace" | "add" | "remove" | "intersect";