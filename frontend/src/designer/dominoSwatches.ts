import { readableTextColor, rgbBytesToHex } from "../color";
import { DEFAULT_DOMINO_COLOR } from "../dominoes/object-model";
import {
  HIDE_SWATCH_ID,
  UNASSIGNED_SWATCH_ID,
  type DominoSwatchId,
} from "../dominoes/swatches";
import type { InventoryEntry } from "../domino-inventory/object-model";

/**
 * How a swatch is drawn, for DominoColorPanel. The two special swatches and the
 * inventory colors are flattened into one shape here so the panel's render loop
 * stays a single code path with no per-kind branching in its JSX — the same
 * reason `background` is a free-form CSS value rather than a hex string, which
 * is what lets Hide's hatch and a solid color share one `style` prop.
 *
 * Behaviour is not here: everything a swatch *does* is keyed by id in
 * dominoes/appStoreSlice.ts.
 */
export interface DominoSwatch {
  id: DominoSwatchId;
  /** Caption under the chip. */
  name: string;
  /** Text inside the chip — an inventory shortcut, or a key name for the specials. */
  shortcutLabel: string;
  /** Any CSS background value. */
  background: string;
  textColor: string;
  /** Hover text, or null for no tip at all (both special swatches). */
  tip: string | null;
  /** Whether the swatch's menu offers Unhide above the selection commands. */
  canUnhide: boolean;
}

// Diagonal hatch: reads as "not a color" next to a grid of flat colors, without
// resembling any domino that could actually be on the plane.
const HIDE_HATCH =
  "repeating-linear-gradient(45deg, var(--color-chrome-2) 0 5px, var(--color-border) 5px 10px)";

const UNASSIGNED_COLOR = rgbBytesToHex(DEFAULT_DOMINO_COLOR);

/**
 * Hide and Unassigned first, then one swatch per active inventory entry.
 *
 * The specials' shortcutLabels name the *keys* that apply them, which the
 * shortcut-typing buffer can never match — it only ever compares against
 * inventory entries' own `shortcut` field, so typing D-E-L does nothing here.
 *
 * `includeSpecials` is false while image mapping is on: neither special means
 * anything to a palette of colours a picture can be mapped onto. Leaving them
 * out here rather than in the panel's JSX is also what lets the panel treat
 * every swatch it draws in that mode as an inventory entry.
 */
export function dominoSwatches(
  entries: InventoryEntry[],
  includeSpecials = true,
): DominoSwatch[] {
  const inventorySwatches = entries
    .filter((e) => e.active)
    .map((e) => ({
      id: e.id,
      name: e.colorName,
      shortcutLabel: e.shortcut,
      background: e.color,
      textColor: readableTextColor(e.color),
      tip: `${e.colorName} — ${e.material}, ${e.finish}, ${e.brand}`,
      canUnhide: false,
    }));
  if (!includeSpecials) return inventorySwatches;

  return [
    {
      id: HIDE_SWATCH_ID,
      name: "Hide",
      shortcutLabel: "DEL",
      background: HIDE_HATCH,
      textColor: "var(--color-text)",
      tip: null,
      canUnhide: true,
    },
    {
      id: UNASSIGNED_SWATCH_ID,
      name: "Unassigned",
      shortcutLabel: "Bksp",
      // Derived from the color an unpainted domino actually renders as, so the
      // swatch and the dominoes it produces can't drift apart.
      background: UNASSIGNED_COLOR,
      textColor: readableTextColor(UNASSIGNED_COLOR),
      tip: null,
      canUnhide: false,
    },
    ...inventorySwatches,
  ];
}