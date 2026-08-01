/**
 * The Domino Inventory catalog: domino *types* available to build with (color,
 * material, finish, brand, stock count), as distinct from `dominoes/` which
 * stores per-instance placed dominoes on the build plane. Ephemeral like the
 * rest of the store — reseeded fresh on every load, never persisted.
 */

export type InventoryMaterial = "Wood" | "Plastic" | "Other";
export const MATERIAL_OPTIONS: InventoryMaterial[] = ["Plastic", "Wood", "Other"];

// Named `finish` (not `type`) — `type` is reserved for DDObject discriminants
// elsewhere in this codebase. The UI column header reads "Finish" too.
export type InventoryFinish = "Standard" | "Clear" | "Translucent" | "Metallic" | "Storm" | "Other";
export const FINISH_OPTIONS: InventoryFinish[] = [
  "Standard",
  "Clear",
  "Translucent",
  "Metallic",
  "Storm",
  "Other",
];

export type InventoryBrand =
  | "H5"
  | "Lamping"
  | "Don"
  | "Bulk"
  | "Greyhound"
  | "Lion"
  | "Dragon"
  | "Centennial"
  | "Other";
export const BRAND_OPTIONS: InventoryBrand[] = [
  "H5",
  "Lamping",
  "Don",
  "Bulk",
  "Greyhound",
  "Lion",
  "Dragon",
  "Centennial",
  "Other",
];

export type InventoryEntryId = `INV-${number}`;

export interface InventoryEntry {
  id: InventoryEntryId;
  /**
   * The same number embedded in `id` ("INV-{n}"), carried alongside it so
   * nothing performance-sensitive ever has to parse it back out — used
   * directly as the array index in DominoData.colorIds and
   * colorLookupStore.ts's rgbById table. Always minted together with `id`
   * from the same source number, so the two can never drift.
   */
  numericId: number;
  active: boolean;
  colorName: string;
  /** "#rrggbb", lowercase — the same shape ColorField already speaks. */
  color: string;
  material: InventoryMaterial;
  finish: InventoryFinish;
  brand: InventoryBrand;
  /** Non-negative integer count of dominoes of this type on hand. */
  available: number;
  /** Max 3 characters. */
  shortcut: string;
  /** Max 100 characters. */
  notes: string;
}

export type InventorySortColumn =
  | "active"
  | "colorName"
  | "color"
  | "material"
  | "finish"
  | "brand"
  | "available"
  | "shortcut";
// "notes" is deliberately excluded — the spec says Notes' header is not
// sortable. "select" has no sort meaning; its header hosts a select-all
// checkbox instead (see InventoryTable.tsx).

/**
 * Default for a new row's dropdown fields: whichever option is most frequent
 * across existing entries, tie-broken by declared option order (an option
 * only replaces the current best on a strict count improvement, so equal
 * counts keep whichever option appears earlier in `options`).
 */
export function modeDefault<T extends string>(
  entries: readonly InventoryEntry[],
  field: "material" | "finish" | "brand",
  options: readonly T[],
): T {
  const counts = new Map<T, number>();
  for (const entry of entries) {
    const value = entry[field] as T;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = options[0];
  let bestCount = -1;
  for (const option of options) {
    const count = counts.get(option) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = option;
    }
  }
  return best;
}

/** Default swatch for a brand-new row — no color is specified by the spec. */
export const NEW_ENTRY_COLOR = "#808080";

/**
 * The 11 seed rows. Hardcoded literals rather than a generic
 * name-to-shortcut/hex derivation function: this is fixed, one-time seed data
 * for exactly these 11 known names, never recomputed at runtime, so a general
 * derivation algorithm here would be premature abstraction. Shortcuts are the
 * first letter(s) of the name, extended where needed to avoid collisions.
 */
const SEED_ROWS: Array<[name: string, hex: string, shortcut: string]> = [
  ["Black", "#1a1a1a", "1"],
  ["White", "#f5f5f5", "9"],
  ["Red", "#e80000", "R"],
  ["Blue", "#1565c0", "B"],
  ["Orange", "#ff790b", "O"],
  ["Brown", "#7e4216", "W"],
  ["Pink", "#ec6f9b", "K"],
  ["Teal", "#009671", "T"],
  ["Yellow", "#fbc02d", "Y"],
  ["Purple", "#7b1fa2", "P"],
  ["Green", "#029c0a", "G"],
];

/** Fresh seed inventory: called once from store.ts's initial state. */
export function createSeedInventory(): InventoryEntry[] {
  return SEED_ROWS.map(([colorName, color, shortcut], i) => ({
    id: `INV-${i + 1}` as InventoryEntryId,
    numericId: i + 1,
    active: true,
    colorName,
    color,
    material: "Plastic",
    finish: "Standard",
    brand: "Other",
    available: 100,
    shortcut,
    notes: "Initial default color",
  }));
}

// ---- Color-wheel sort ----

/**
 * True for a color with R = G = B (black/white/grey) — these have no hue and
 * sort as their own group ahead of every chromatic color.
 */
function isAchromatic(hex: string): boolean {
  const r = hex.slice(1, 3);
  const g = hex.slice(3, 5);
  const b = hex.slice(5, 7);
  return r === g && g === b;
}

/**
 * Hex -> [hue, lightness]. Hue is the standard HSL hue (0-360), i.e. literal
 * position on the color wheel (0 for an achromatic color, where hue is
 * undefined). Lightness is the plain average of the three raw channel values
 * (0-1) — the same "brightness" measure used throughout this module, not HSL's
 * (max+min)/2 lightness.
 */
export function hexToHueLightness(hex: string): [hue: number, lightness: number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lightness = (r + g + b) / 3;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return [0, lightness]; // achromatic: hue undefined, treat as 0

  const d = max - min;
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, lightness];
}

/**
 * Signed comparator for the Color column: every achromatic color (black,
 * white, grey — R = G = B) sorts ahead of every chromatic color, ordered
 * among themselves by lightness; chromatic colors sort by hue, then by
 * lightness as a tiebreak.
 */
export function compareColor(a: string, b: string): number {
  const achromaticA = isAchromatic(a);
  const achromaticB = isAchromatic(b);
  if (achromaticA !== achromaticB) return achromaticA ? -1 : 1;

  const [hueA, lightA] = hexToHueLightness(a);
  const [hueB, lightB] = hexToHueLightness(b);
  if (achromaticA) return lightA - lightB;
  return hueA !== hueB ? hueA - hueB : lightA - lightB;
}

/** New entries are named "New Color" (see addInventoryEntry in store.ts). */
const NEW_ENTRY_NAME_PREFIX = "New ";

/** A not-yet-renamed new entry, pinned to the top of every sort. */
export function isNewEntry(entry: InventoryEntry): boolean {
  return entry.colorName.startsWith(NEW_ENTRY_NAME_PREFIX);
}

/** Comparator dispatch used by InventoryTable for every sortable column. */
export function compareInventoryEntries(
  a: InventoryEntry,
  b: InventoryEntry,
  column: InventorySortColumn,
): number {
  switch (column) {
    case "active":
      return Number(a.active) - Number(b.active);
    case "color":
      return compareColor(a.color, b.color);
    case "available":
      return a.available - b.available;
    case "colorName":
    case "material":
    case "finish":
    case "brand":
    case "shortcut":
      return a[column].localeCompare(b[column]);
  }
}