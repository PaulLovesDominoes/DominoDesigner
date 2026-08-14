import { DOMINO_SIZE } from "../dimensions";
import { nearestColor } from "../color-distance/registry";
import type { AnyColorDistanceDefinition, PreparedColor } from "../color-distance/base";
import { scanRunsForward, type AnyDitherDefinition, type Rgb } from "../dither/base";
import { getDDObjectBounds, getDominoExpansion, getDominoRowCol } from "../object-types/registry";
import type { DDObject } from "../object-types/registry";
import type { DominoData } from "../dominoes/object-model";
import type { ImageAsset } from "./assetStore";
import { imageOriginFor, imageWorldRect, type DominoImageMap } from "./object-model";
import type { AnyPatchSampleDefinition } from "./patch-sample/base";
import { resolvePatchBounds } from "./patch-sample/patchBounds";

/**
 * Turning a picture into domino colors.
 *
 * The work is handed out in chunks rather than done in one go, so the browser
 * can draw between them: the user sees the field fill in, and the Cancel button
 * stays clickable. `step` is the chunk; the caller (image-map/appStoreSlice.ts)
 * drives it from an animation frame.
 */

export interface ColorMappingJob {
  /** How many dominoes this run will look at. */
  total: number;
  /** How many it has looked at so far. */
  done: number;
  /**
   * Look at up to `budget` more dominoes and report the color changes found.
   * A domino the picture does not reach produces nothing, so an empty result
   * does not mean the run has finished — compare `done` against `total` for
   * that.
   */
  step(budget: number): Array<[index: number, colorId: number]>;
}

/** Everything a run needs that isn't the element or the picture itself. */
export interface ColorMappingSettings {
  /** Prepared once for the whole run by the metric's own prepare(). */
  candidates: readonly PreparedColor[];
  metric: AnyColorDistanceDefinition;
  /** How a patch of picture is reduced to the one colour the metric is asked about. */
  patchSample: AnyPatchSampleDefinition;
  dither: AnyDitherDefinition;
  /**
   * One step of the palette, in sRGB bytes, as measured by ditherAmplitude.ts.
   * Handed to the dither un-multiplied by the strength below, because the two
   * kinds of dither use them differently: a pattern scales its pattern by both,
   * while a diffusing dither ignores the amplitude entirely and uses the
   * strength to decide how much of its shortfall to pass on.
   */
  ditherAmplitude: number;
  /** The panel's Dither Strength slider, 0 to 1. */
  ditherStrength: number;
  /**
   * numericId -> sRGB bytes, from domino-inventory/colorLookupStore.ts. Only a
   * diffusing dither reads it, to find out what colour the domino it just chose
   * actually is so it can measure the shortfall.
   *
   * Snapshotted by the caller alongside `candidates` rather than read from the
   * store here: a run spans many frames, and an inventory edit part-way through
   * must not shift the table underneath it.
   */
  rgbById: readonly ([number, number, number] | undefined)[];
}

/** Keeps a colour inside the range sRGB can express. */
const clampByte = (channel: number) => (channel < 0 ? 0 : channel > 255 ? 255 : channel);

/**
 * Builds the run, or returns undefined when there is nothing to do — no
 * footprint, no origin, a picture with no size, or no dominoes to fill.
 *
 * `targets` are the flat indices this run may colour, and nothing outside that
 * list is ever touched. They are decided when image mapping mode is switched on
 * and handed in here, rather than worked out from the colours each domino
 * happens to hold — see the slice's `imageMapTargets`.
 */
export function createColorMappingJob(
  ddObject: DDObject,
  data: DominoData,
  image: DominoImageMap,
  asset: ImageAsset,
  targets: Uint32Array,
  settings: ColorMappingSettings,
): ColorMappingJob | undefined {
  const bounds = getDDObjectBounds(ddObject);
  const origin = imageOriginFor(ddObject);
  if (!bounds || !origin || targets.length === 0) return undefined;

  const rect = imageWorldRect(image, origin);
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  // How much build plane each domino owns. The element type already answers
  // this for the Expand toggle — for a field it is half the spacing on each
  // side, which makes the patch exactly one pitch, so the patches tile the grid
  // with no gaps and no overlap. Note this is the raw registry accessor and NOT
  // dominoes/expansion.ts's resolveDominoExpansion, which deliberately reports
  // zeroes unless the user has Expand switched on.
  const room = getDominoExpansion(ddObject);
  const halfLeft = DOMINO_SIZE.thickness / 2 + (room?.x0 ?? 0);
  const halfRight = DOMINO_SIZE.thickness / 2 + (room?.x1 ?? 0);
  const halfDown = DOMINO_SIZE.width / 2 + (room?.y0 ?? 0);
  const halfUp = DOMINO_SIZE.width / 2 + (room?.y1 ?? 0);

  const { candidates, metric, patchSample, dither, ditherAmplitude, ditherStrength, rgbById } =
    settings;

  // Where each domino sits in its element's own grid, which is what a dither is
  // laid out on. The type declares this for cross-element paste and it is
  // contracted to be structurally meaningful — dominoes next to each other in
  // the layout differ by 1 in exactly one coordinate — which is precisely what
  // both a pattern and a diffusing dither need, and is why this works for a
  // polar element type as readily as for a field. A type declaring none simply
  // gets no dithering.
  const rowColOf = getDominoRowCol(ddObject);

  // ── Grid pre-pass ──
  //
  // Every target's row and column, worked out once here instead of per domino
  // inside the loop. Keyed by position in `targets`, not by domino index, so
  // these are only as long as the target list.
  //
  // Two things need it. A diffusing dither has to see the dominoes row by row
  // (below), and it sizes its buffer of owed shortfalls from the column range.
  // It also saves the loop a function call and a fresh {row, col} object per
  // domino, which is a small win even for the dithers that do not care.
  const rowOf = new Int32Array(targets.length);
  const colOf = new Int32Array(targets.length);
  let colMin = 0;
  let colMax = 0;
  if (rowColOf) {
    for (let t = 0; t < targets.length; t++) {
      const { row, col } = rowColOf(targets[t]);
      rowOf[t] = row;
      colOf[t] = col;
      if (t === 0 || col < colMin) colMin = col;
      if (t === 0 || col > colMax) colMax = col;
    }
  }

  // The order the dominoes are visited in. Left as the caller gave it unless the
  // dither asks for a serpentine scan — along one row, back along the next — in
  // which case it is sorted into exactly the order base.ts's scanRunsForward
  // describes, because that is the same rule the run itself uses to decide which
  // side of a domino is "ahead".
  const order = new Uint32Array(targets.length);
  for (let t = 0; t < targets.length; t++) order[t] = t;
  if (dither.scanOrder === "serpentine" && rowColOf) {
    order.sort((a, b) =>
      rowOf[a] !== rowOf[b]
        ? rowOf[a] - rowOf[b]
        : scanRunsForward(rowOf[a])
          ? colOf[a] - colOf[b]
          : colOf[b] - colOf[a],
    );
  }

  const ditherRun = dither.createRun({
    amplitude: ditherAmplitude,
    strength: ditherStrength,
    colMin,
    colMax,
  });

  // Refilled per domino rather than rebuilt, as the dither runs do with their own
  // scratch. `wanted` is the colour actually asked about and `chosen` the
  // inventory colour that won; a diffusing dither measures its shortfall from
  // the pair.
  const wanted: Rgb = { r: 0, g: 0, b: 0 };
  const chosen: Rgb = { r: 0, g: 0, b: 0 };

  const { pixels } = asset;
  // World mm -> image pixels. Build-plane Y runs up and image rows run down, so
  // the Y factor is negated and measured from the picture's top edge.
  const pixelsPerMmX = pixels.width / rect.width;
  const pixelsPerMmY = pixels.height / rect.height;
  const rectTop = rect.y + rect.height;

  const job: ColorMappingJob = {
    total: targets.length,
    done: 0,
    step(budget) {
      const writes: Array<[index: number, colorId: number]> = [];
      const stopAt = Math.min(targets.length, job.done + budget);

      for (let t = job.done; t < stopAt; t++) {
        const position = order[t];
        const i = targets[position];
        // The target list was captured when the mode was entered, and a field
        // can be neither resized nor edited from inside it — but an undo can
        // regenerate one, so a stale index is worth a cheap guard.
        if (i >= data.count) continue;

        // DominoData positions are relative to the element's position, which
        // bounds.x/y is, so this puts the domino's centre on the build plane.
        const centreX = bounds.x + data.positions[3 * i];
        const centreY = bounds.y + data.positions[3 * i + 1];

        const patch = resolvePatchBounds(
          pixels,
          (centreX - halfLeft - rect.x) * pixelsPerMmX,
          (rectTop - (centreY + halfUp)) * pixelsPerMmY,
          (centreX + halfRight - rect.x) * pixelsPerMmX,
          (rectTop - (centreY - halfDown)) * pixelsPerMmY,
        );
        if (!patch) continue;

        const sample = patchSample.sample(pixels, patch);
        if (!sample) continue;

        // The dither's shift goes on before the search, not after it: the whole
        // point is to change which inventory colour comes out nearest. A type
        // with no row/column mapping has no grid for a dither to work on, so it
        // simply gets none.
        //
        // Clamped to 0-255 because a colour outside that range is not one sRGB
        // can express, and because it is what stops a diffusing dither running
        // away: once a channel is pinned at an end, the shortfall measured
        // against it cannot keep growing, so no separate cap on the carried
        // error is needed (see dither/diffusion.ts). It changes nothing for four
        // of the five metrics, which already clamp inside linearRgb.ts's
        // toByteIndex.
        if (rowColOf) {
          const shift = ditherRun.colorShiftAt(rowOf[position], colOf[position]);
          wanted.r = clampByte(sample.r + shift.r);
          wanted.g = clampByte(sample.g + shift.g);
          wanted.b = clampByte(sample.b + shift.b);
        } else {
          wanted.r = clampByte(sample.r);
          wanted.g = clampByte(sample.g);
          wanted.b = clampByte(sample.b);
        }

        const nearest = nearestColor(metric, candidates, wanted.r, wanted.g, wanted.b);
        if (!nearest) continue;
        writes.push([i, nearest.numericId]);

        // Tell the dither what the domino came out as. A pattern ignores this; a
        // diffusing one measures how far the choice missed and hands the
        // shortfall to the dominoes it has not reached yet. The lookup should
        // never miss — the candidate came from the inventory — but a colour
        // whose bytes cannot be found is skipped rather than reported as a
        // shortfall of pure black.
        const chosenRgb = rgbById[nearest.numericId];
        if (rowColOf && chosenRgb) {
          chosen.r = chosenRgb[0];
          chosen.g = chosenRgb[1];
          chosen.b = chosenRgb[2];
          ditherRun.recordChoice(rowOf[position], colOf[position], wanted, chosen);
        }
      }

      job.done = stopAt;
      return writes;
    },
  };

  return job;
}