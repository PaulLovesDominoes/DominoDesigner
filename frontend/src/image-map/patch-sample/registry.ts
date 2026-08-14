import type { AnyPatchSampleDefinition } from "./base";
import { averagePatchSample } from "./average";
import { dominantPatchSample } from "./dominant";
import { dominantMergedPatchSample } from "./dominantMerged";

// ── Register patch samplers here (name -> definition module) ──
//
// Adding one: create patch-sample/<name>.ts exporting a PatchSampleDefinition,
// then add one line here. That is the only central edit — the panel's dropdown
// and the mapping run are both driven off this map and neither names a variant.
// Order is dropdown order.
//
// One file each rather than a folder each, matching color-distance and dither: a
// sampler is pure arithmetic with no preview component to keep beside it. What
// variants share lives in its own module alongside them — patchBounds.ts for the
// geometry all three need, buckets.ts for the counting the two dominant ones do —
// the same arrangement lab.ts and ordered.ts have.
export const PATCH_SAMPLES = {
  average: averagePatchSample,
  dominant: dominantPatchSample,
  dominantMerged: dominantMergedPatchSample,
} satisfies Record<string, AnyPatchSampleDefinition>;

/** Union of all registered sampler names. */
export type PatchSampleId = keyof typeof PATCH_SAMPLES;

/**
 * What the Sampling dropdown starts on. Averaging suits photographs, which are
 * the more common thing to map and the more forgiving if the setting is left
 * alone.
 */
export const DEFAULT_PATCH_SAMPLE: PatchSampleId = "average";

/**
 * Registration order, for the dropdown. A module-level constant rather than a
 * function, so a component can map it without allocating a fresh array per
 * render — and so it can never be mistaken for a store selector (React #185).
 */
export const PATCH_SAMPLE_LIST: readonly AnyPatchSampleDefinition[] =
  Object.values(PATCH_SAMPLES);

export const getPatchSample = (id: PatchSampleId): AnyPatchSampleDefinition =>
  PATCH_SAMPLES[id];