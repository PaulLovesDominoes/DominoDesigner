import type { AnyColorDistanceDefinition, PreparedColor } from "./base";
import { greyscaleDistance } from "./greyscale";
import { perceptualDistance } from "./perceptual";
import { perceptualOklabDistance } from "./perceptualOklab";
import { valueWeightedDistance } from "./valueWeighted";
import { weightedRgbDistance } from "./weightedRgb";

// ── Register color-distance metrics here (name -> definition module) ──
//
// Adding a metric: create color-distance/<name>.ts exporting a
// ColorDistanceDefinition, then add one line here. That is the only central
// edit — the panel's dropdown and the mapping run are both driven off this map
// and neither names a variant. Order is dropdown order.
//
// One file each rather than a folder each, unlike shape-select and paint-brush:
// a metric is pure arithmetic with no preview component to keep beside it, so a
// folder would hold a single module.
export const COLOR_DISTANCES = {
  weightedRgb: weightedRgbDistance,
  oklab: perceptualOklabDistance,
  perceptual: perceptualDistance,
  valueWeighted: valueWeightedDistance,
  greyscale: greyscaleDistance,
} satisfies Record<string, AnyColorDistanceDefinition>;

/** Union of all registered metric names. */
export type ColorDistanceId = keyof typeof COLOR_DISTANCES;

/**
 * What the Color Distance dropdown starts on. OKLab rather than weighted RGB,
 * which was the default while it was the only cheap option: OKLab gives a better
 * answer on every kind of picture and costs less than CIELAB does.
 */
export const DEFAULT_COLOR_DISTANCE: ColorDistanceId = "oklab";

/**
 * Registration order, for the dropdown. A module-level constant rather than a
 * function, so a component can map it without allocating a fresh array per
 * render — and so it can never be mistaken for a store selector (React #185).
 */
export const COLOR_DISTANCE_LIST: readonly AnyColorDistanceDefinition[] =
  Object.values(COLOR_DISTANCES);

export const getColorDistance = (id: ColorDistanceId): AnyColorDistanceDefinition =>
  COLOR_DISTANCES[id];

/**
 * The nearest of `candidates` to the color (r, g, b), or undefined if there are
 * none. Every caller of a metric goes through this rather than writing the
 * search loop itself, so "nearest" means one thing.
 *
 * It is also what keeps the metric's three stages honest: sample() is called
 * here, once, outside the loop over candidates. A metric that did that
 * conversion inside distanceTo instead would repeat it for every color in the
 * inventory, which is what the code here used to do.
 *
 * Kept beside the registry rather than in image-map because it is the natural
 * companion to it: a metric answers "how far", and this is the "which one" that
 * every user of a metric actually wants.
 */
export function nearestColor(
  metric: AnyColorDistanceDefinition,
  candidates: readonly PreparedColor[],
  r: number,
  g: number,
  b: number,
): PreparedColor | undefined {
  const sample = metric.sample(r, g, b);
  let best: PreparedColor | undefined;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = metric.distanceTo(candidate, sample);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}