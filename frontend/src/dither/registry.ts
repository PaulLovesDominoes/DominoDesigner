import type { AnyDitherDefinition } from "./base";
import { atkinsonDither } from "./atkinson";
import { bayer4Dither } from "./bayer4";
import { bayer8Dither } from "./bayer8";
import { floydSteinbergDither } from "./floydSteinberg";
import { noDither } from "./none";
import { randomDither } from "./random";

// ── Register dithers here (name -> definition module) ──
//
// Adding a dither: create dither/<name>.ts exporting a DitherDefinition, then
// add one line here. That is the only central edit — the panel's dropdown and
// the mapping run are both driven off this map and neither names a variant.
// Order is dropdown order.
//
// One file each rather than a folder each, matching color-distance and unlike
// shape-select and paint-brush: a dither is pure arithmetic with no preview
// component to keep beside it, so a folder would hold a single module. Maths
// shared between entries goes in its own module alongside them — ordered.ts for
// the Bayer matrix, pattern.ts and diffusion.ts for the two kinds of dither
// themselves — again as color-distance does with lab.ts.
//
// The pattern dithers come first and the diffusing ones after: the order runs
// from no effect, through the ones that lay a fixed texture over the field, to
// the ones that work the shortfall out from the picture itself.
export const DITHERS = {
  none: noDither,
  bayer4: bayer4Dither,
  bayer8: bayer8Dither,
  random: randomDither,
  floydSteinberg: floydSteinbergDither,
  atkinson: atkinsonDither,
} satisfies Record<string, AnyDitherDefinition>;

/** Union of all registered dither names. */
export type DitherId = keyof typeof DITHERS;

/** What the Dither dropdown starts on. */
export const DEFAULT_DITHER: DitherId = "none";

/**
 * What the strength slider starts at, 0 to 1.
 *
 * Full strength is a sensible amount rather than an aggressive one, in both
 * kinds of dither. For a pattern, how far to push is measured from the palette
 * (image-map/ditherAmplitude.ts) and 1 means "up to half the distance to the
 * neighbouring inventory color" — far enough to cross a boundary where the
 * picture is close to it, and no further. For a diffusing dither, 1 means the
 * whole shortfall is passed on, which is the textbook version of it. At 0 both
 * kinds do nothing at all, exactly as `none` does.
 */
export const DEFAULT_DITHER_STRENGTH = 0.5;

/**
 * Registration order, for the dropdown. A module-level constant rather than a
 * function, so a component can map it without allocating a fresh array per
 * render — and so it can never be mistaken for a store selector (React #185).
 */
export const DITHER_LIST: readonly AnyDitherDefinition[] = Object.values(DITHERS);

export const getDither = (id: DitherId): AnyDitherDefinition => DITHERS[id];