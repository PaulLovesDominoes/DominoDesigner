import { patternDither } from "./pattern";

/**
 * No dithering — every domino takes the inventory color nearest to its own patch
 * of the picture, and nothing is nudged.
 *
 * A registered entry rather than a null value, deliberately unlike shape-select,
 * where "no shape armed" is `null` and the rectangle band has no registry entry.
 * The difference is that this one backs a dropdown, whose value is a string; a
 * `DitherId | null` would put a special case in the store, in the panel and in
 * the mapping run to save these few lines.
 */
export const noDither = patternDither("none", "None", () => 0);