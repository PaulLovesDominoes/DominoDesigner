/** Parses "#rrggbb" (case-insensitive) into 0-255 byte triples. */
export function hexToRgbBytes(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** The inverse of hexToRgbBytes: 0-255 byte triples back into lowercase "#rrggbb". */
export function rgbBytesToHex(rgb: readonly [number, number, number]): string {
  return `#${rgb.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * YIQ perceived-brightness heuristic: which of black/white reads better on
 * top of `hex`. Good enough for "black lettering on light swatches, white on
 * dark" without full WCAG contrast-ratio math.
 */
export function readableTextColor(hex: string): "#000000" | "#ffffff" {
  const [r, g, b] = hexToRgbBytes(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? "#000000" : "#ffffff";
}