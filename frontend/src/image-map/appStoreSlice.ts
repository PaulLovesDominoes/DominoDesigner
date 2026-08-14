import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import type { DDObjectId } from "../object-types/base";
import { pushOperation } from "../history/appStoreSlice";
import { useDominoDataStore } from "../dominoes/store";
import { useDominoSelectionStore } from "../dominoes/selectionStore";
import { commitDominoColors } from "../dominoes/colorWrites";
import { useColorLookupStore } from "../domino-inventory/colorLookupStore";
import {
  DEFAULT_COLOR_DISTANCE,
  getColorDistance,
  type ColorDistanceId,
} from "../color-distance/registry";
import {
  DEFAULT_DITHER,
  DEFAULT_DITHER_STRENGTH,
  getDither,
  type DitherId,
} from "../dither/registry";
import {
  DEFAULT_PATCH_SAMPLE,
  getPatchSample,
  type PatchSampleId,
} from "./patch-sample/registry";
import { disposeImageAsset, getImageAsset } from "./assetStore";
import { resolveDitherAmplitude } from "./ditherAmplitude";
import { createColorMappingJob, type ColorMappingJob } from "./mapping";
import type { DominoImageMap, ImageMapLayer } from "./object-model";

/**
 * Image mapping mode: the picture laid over each element, the mode's own view
 * state, and the colour-mapping run.
 *
 * A slice of the app store rather than a store of its own, because it is
 * ordinary copy-on-write state and because the mapping run needs `undoStack`,
 * `ddObjects`, `inventoryEntries` and `dominoEditingId` together. The bulky part
 * — the decoded texture and pixels — is deliberately *not* here; see
 * assetStore.ts.
 *
 * ---- Import-cycle note ----
 * As with the other slices, store.ts must remain the only importer of
 * `createImageMapSlice`: this module reaches dominoes/store and
 * dominoes/colorWrites, which import useStore back from store.ts.
 */

/**
 * How many dominoes one animation frame of a mapping run looks at. Big enough
 * that a typical field finishes in a frame or two, small enough that a 250x250
 * field still repaints and stays cancellable while it works.
 */
const MAP_CHUNK_DOMINOES = 4000;

/**
 * Shown when every domino already had a colour at the moment image mapping was
 * switched on, so the target set came out empty. It names the way out, because
 * the reason is not visible on the screen — the dominoes look perfectly
 * mappable, and nothing about the picture is wrong.
 */
const NO_TARGETS_MESSAGE =
  "Every domino already had a color when image mapping was switched on, so there " +
  "is nothing to map. Leave image mapping, unassign the dominoes you want filled " +
  "in, then switch it back on.";

export interface ImageMapSlice {
  /** At most one picture per element, keyed by the element's id. */
  imageMaps: Record<DDObjectId, DominoImageMap>;

  /**
   * Whether image mapping mode is on. It is a sub-mode *within* domino editing
   * mode — deliberately not a ToolId, for the same reason the armed shape and
   * the armed brush are not: `activeTool` is already held by "editDominoes" for
   * the whole mode, and this is one of three mutually exclusive choices inside
   * it. View state, never document state, never undoable; cleared on leaving the
   * mode.
   */
  imageMapActive: boolean;

  /** Whether the picture is showing its move/resize handles. */
  imageMapSelected: boolean;

  /** Which metric the Map Colors button will use. */
  colorDistanceId: ColorDistanceId;

  /** How a patch of picture is reduced to the one colour that metric is asked about. */
  patchSampleId: PatchSampleId;

  /** Which dither pattern the Map Colors button will use. */
  ditherId: DitherId;

  /** How hard the dither nudges each domino, 0 to 1. */
  ditherStrength: number;

  /** 0..1 while a mapping run is going, null when none is. Drives the progress bar. */
  colorMappingProgress: number | null;

  /**
   * The dominoes a mapping run is allowed to colour, per element: exactly those
   * that were unassigned at the moment image mapping was switched on. Ascending
   * flat indices.
   *
   * Freezing the set on entry, rather than working it out afresh from the colours
   * each domino currently holds, is what makes repeated runs predictable. Every
   * run fills the same dominoes, so changing the metric or the dither and pressing
   * Map Colors again simply replaces the previous result — and nothing the user
   * painted by hand can ever be in the set, because it was not unassigned when the
   * set was taken.
   *
   * It also means leaving image mapping and coming back *commits* whatever was
   * mapped: those dominoes now hold real colours, so the fresh capture excludes
   * them. That is the intended way to lock a result in.
   *
   * A Uint32Array rather than a Set — a field of 62,500 dominoes is ordinary, and
   * one flat buffer matches how the rest of dominoes/ stores per-domino data.
   */
  imageMapTargets: Record<DDObjectId, Uint32Array>;

  /** Something to tell the user in the panel — a failed load, or a metric with no colours. */
  imageMapMessage: string | null;

  setImageMapActive(active: boolean): void;
  setImageMapSelected(selected: boolean): void;
  setImageMap(ddObjectId: DDObjectId, image: DominoImageMap): void;
  updateImageMap(ddObjectId: DDObjectId, patch: Partial<DominoImageMap>): void;
  clearImageMap(ddObjectId: DDObjectId): void;
  /**
   * Throw away everything image mapping was holding for this element: the
   * picture, its decoded pixels, and the set of dominoes a run was allowed to
   * fill. For when the element's whole session is over — Cancel in domino
   * editing, or the element being deleted for good.
   */
  discardImageMapSession(ddObjectId: DDObjectId): void;
  setImageMapLayer(ddObjectId: DDObjectId, layer: ImageMapLayer): void;
  setColorDistance(id: ColorDistanceId): void;
  setPatchSample(id: PatchSampleId): void;
  setDither(id: DitherId): void;
  setDitherStrength(strength: number): void;
  setImageMapMessage(message: string | null): void;

  /** Start mapping the picture onto the edited element's target dominoes. */
  startColorMapping(): void;
  /**
   * Put every target domino back to unassigned — the state they were all in when
   * image mapping was switched on. One undo step, like a mapping run.
   */
  clearMappedColors(): void;
  /**
   * Abandon a mapping run, putting every domino it has already recoloured back.
   * Also called on leaving the mode, so a run can never outlive what it is
   * painting.
   */
  cancelColorMapping(): void;
}

export const createImageMapSlice: StateCreator<AppState, [], [], ImageMapSlice> = (set, get) => {
  /**
   * The run in progress. Held here rather than in the store because none of it
   * is anything the UI renders — the store carries `colorMappingProgress` for
   * that — and because `before` is mutated in place as the run goes.
   *
   * `before` is what each domino was before this run touched it, first value
   * seen winning, exactly as a paint stroke records its own. It is both the undo
   * entry the run finally pushes and what Cancel puts back.
   */
  let activeMapping: {
    parentId: DDObjectId;
    job: ColorMappingJob;
    before: Map<number, number>;
    frame: number;
  } | null = null;

  /**
   * Ends a run: `commit` true records everything it painted as one undo step,
   * false puts it all back and records nothing.
   *
   * One undo entry for the whole run is the same trade a paint stroke makes and
   * for the same reason — the colours have to appear as they are found, so the
   * user can watch it work, but Ctrl+Z must take back the mapping rather than
   * one frame of it.
   */
  const finishMapping = (commit: boolean) => {
    const mapping = activeMapping;
    if (!mapping) return;
    cancelAnimationFrame(mapping.frame);
    activeMapping = null;
    set({ colorMappingProgress: null });

    const data = useDominoDataStore.getState().get(mapping.parentId);
    if (!data || mapping.before.size === 0) return;

    if (!commit) {
      // Back through commitDominoColors rather than writing the column
      // directly, so the restore re-syncs colour memory — without that a later
      // regenerate would repaint the very colours this just discarded. The
      // operation it returns is dropped: an abandoned run records no history.
      commitDominoColors(
        mapping.parentId,
        get().ddObjects[mapping.parentId],
        data,
        mapping.before,
      );
      return;
    }

    const indices: number[] = [];
    const before: number[] = [];
    const after: number[] = [];
    for (const [index, priorColorId] of mapping.before) {
      if (index >= data.count) continue;
      const currentColorId = data.colorIds[index];
      if (currentColorId === priorColorId) continue;
      indices.push(index);
      before.push(priorColorId);
      after.push(currentColorId);
    }
    if (indices.length === 0) return;

    // Built by hand rather than through commitDominoColors, because the columns
    // are already written — the clear at the start and every chunk after it wrote
    // them, and synced colour memory along the way. All that is left is the
    // history entry, which covers the clear and the mapping together so Ctrl+Z
    // takes back the whole press of the button.
    set((st) => ({
      ...pushOperation(st.undoStack, {
        kind: "dominoColors",
        parentId: mapping.parentId,
        indices: Uint32Array.from(indices),
        before: Uint32Array.from(before),
        after: Uint32Array.from(after),
      }),
    }));
  };

  const runMappingFrame = () => {
    const mapping = activeMapping;
    if (!mapping) return;

    const data = useDominoDataStore.getState().get(mapping.parentId);
    if (!data) {
      finishMapping(true);
      return;
    }

    const writes = mapping.job.step(MAP_CHUNK_DOMINOES);
    if (writes.length > 0) {
      const op = commitDominoColors(
        mapping.parentId,
        get().ddObjects[mapping.parentId],
        data,
        writes,
      );
      if (op) {
        for (let k = 0; k < op.indices.length; k++) {
          const index = op.indices[k];
          if (!mapping.before.has(index)) mapping.before.set(index, op.before[k]);
        }
      }
    }

    if (mapping.job.done >= mapping.job.total) {
      finishMapping(true);
      return;
    }
    // Progress is written only here, on the way to scheduling *another* chunk —
    // never when the run starts. A run that finishes in one frame therefore
    // shows no progress bar at all, which is the honest answer for work that
    // took a frame. Setting it up front could not have worked anyway: React
    // would coalesce the 0 and the null that followed it into a single render,
    // so the bar was never committed to the DOM for a short run.
    set({ colorMappingProgress: mapping.job.done / mapping.job.total });
    mapping.frame = requestAnimationFrame(runMappingFrame);
  };

  return {
    imageMaps: {},
    imageMapActive: false,
    imageMapSelected: false,
    colorDistanceId: DEFAULT_COLOR_DISTANCE,
    patchSampleId: DEFAULT_PATCH_SAMPLE,
    ditherId: DEFAULT_DITHER,
    ditherStrength: DEFAULT_DITHER_STRENGTH,
    colorMappingProgress: null,
    imageMapTargets: {},
    imageMapMessage: null,

    // Turning image mapping on disarms the other two sub-modes, and they disarm
    // it in turn (see the shape-select and paint-brush slices) — a cross-slice
    // write needing no import either way, since `set` is typed against the whole
    // AppState. The domino selection goes too: nothing in this mode acts on it,
    // and leaving white boxes lit under the picture would only be confusing.
    setImageMapActive: (imageMapActive) => {
      const parentId = get().dominoEditingId;
      if (parentId) {
        useDominoSelectionStore.getState().clear(parentId);
        useDominoSelectionStore.getState().clearBrushHover(parentId);
      }
      if (!imageMapActive) get().cancelColorMapping();

      // Switching the mode on is what decides which dominoes any mapping run in
      // this session may colour: the ones with no colour right now. The single
      // `=== 0` test is all the filtering needed, and needs no masking — a hidden
      // domino's value is at least HIDDEN_COLOR_FLAG and a painted one is a small
      // numericId, so neither can be mistaken for unassigned.
      let imageMapTargets = get().imageMapTargets;
      if (imageMapActive && parentId) {
        const data = useDominoDataStore.getState().get(parentId);
        const targets: number[] = [];
        if (data) {
          for (let i = 0; i < data.count; i++) {
            if (data.colorIds[i] === 0) targets.push(i);
          }
        }
        imageMapTargets = { ...imageMapTargets, [parentId]: Uint32Array.from(targets) };
      }

      set({
        imageMapActive,
        imageMapSelected: false,
        imageMapMessage: null,
        imageMapTargets,
        dominoShapeSelectId: null,
        dominoShapeSelectHint: null,
        dominoBrushId: null,
      });
    },

    setImageMapSelected: (imageMapSelected) => set({ imageMapSelected }),

    setImageMap: (ddObjectId, image) =>
      set((s) => ({ imageMaps: { ...s.imageMaps, [ddObjectId]: image } })),

    updateImageMap: (ddObjectId, patch) =>
      set((s) => {
        const image = s.imageMaps[ddObjectId];
        if (!image) return {};
        return { imageMaps: { ...s.imageMaps, [ddObjectId]: { ...image, ...patch } } };
      }),

    // The target set deliberately stays. It belongs to this run of the mode, not
    // to the picture — load another image and the same dominoes are still the
    // ones on offer to fill.
    clearImageMap: (ddObjectId) => {
      disposeImageAsset(ddObjectId);
      set((s) => {
        if (!s.imageMaps[ddObjectId]) return {};
        const imageMaps = { ...s.imageMaps };
        delete imageMaps[ddObjectId];
        return { imageMaps, imageMapSelected: false };
      });
    },

    discardImageMapSession: (ddObjectId) => {
      get().clearImageMap(ddObjectId);
      set((s) => {
        if (!s.imageMapTargets[ddObjectId]) return {};
        const imageMapTargets = { ...s.imageMapTargets };
        delete imageMapTargets[ddObjectId];
        return { imageMapTargets };
      });
    },

    setImageMapLayer: (ddObjectId, layer) => get().updateImageMap(ddObjectId, { layer }),

    setColorDistance: (colorDistanceId) => set({ colorDistanceId, imageMapMessage: null }),

    setPatchSample: (patchSampleId) => set({ patchSampleId, imageMapMessage: null }),

    setDither: (ditherId) => set({ ditherId, imageMapMessage: null }),

    setDitherStrength: (ditherStrength) => set({ ditherStrength }),

    setImageMapMessage: (imageMapMessage) => set({ imageMapMessage }),

    startColorMapping: () => {
      const s = get();
      const parentId = s.dominoEditingId;
      if (!parentId || activeMapping) return;

      const ddObject = s.ddObjects[parentId];
      const image = s.imageMaps[parentId];
      const asset = getImageAsset(parentId);
      const data = useDominoDataStore.getState().get(parentId);
      if (!ddObject || !image || !asset || !data) return;

      const targets = s.imageMapTargets[parentId];
      if (!targets || targets.length === 0) {
        set({ imageMapMessage: NO_TARGETS_MESSAGE });
        return;
      }

      // Prepared once for the whole run: every inventory colour's hex is parsed
      // and converted here rather than tens of thousands of times inside the
      // loop. An empty list means this metric has nothing it is willing to use.
      const metric = getColorDistance(s.colorDistanceId);
      const candidates = metric.prepare(s.inventoryEntries);
      if (candidates.length === 0) {
        set({ imageMapMessage: metric.emptyMessage });
        return;
      }

      // How far apart the colours this metric is willing to use actually are,
      // measured here rather than being a constant that suits one size of
      // palette. See ditherAmplitude.ts. Deliberately not multiplied by the
      // strength slider: the two kinds of dither use them differently, so both
      // go across separately.
      const ditherAmplitude = resolveDitherAmplitude(metric, candidates);

      const job = createColorMappingJob(ddObject, data, image, asset, targets, {
        candidates,
        metric,
        patchSample: getPatchSample(s.patchSampleId),
        dither: getDither(s.ditherId),
        ditherAmplitude,
        ditherStrength: s.ditherStrength,
        // Snapshotted with everything else the run needs, so an inventory edit
        // part-way through cannot shift the table underneath it. Only a
        // diffusing dither reads it, to find what colour it actually chose.
        rgbById: useColorLookupStore.getState().rgbById,
      });
      if (!job) return;

      const before = new Map<number, number>();

      // Every target goes back to unassigned before the run starts, so the field
      // ends up showing the result of *this* picture in *this* position and
      // nothing else. Without it, moving the picture and mapping again would
      // leave the previous run's colours stranded wherever the new placement
      // does not reach — a mapping run deliberately leaves a domino alone when
      // the picture does not cover it or is transparent there.
      //
      // Folded into the same `before` map the chunks write to, so the clear and
      // the mapping land in the run's single undo entry together. First value
      // seen per domino wins, which is what makes that work: the clear records
      // the colour the domino really started with, and the chunk that repaints
      // it later does not overwrite that memory.
      const clearOperation = commitDominoColors(
        parentId,
        ddObject,
        data,
        Array.from(targets, (index) => [index, 0] as [number, number]),
      );
      if (clearOperation) {
        for (let k = 0; k < clearOperation.indices.length; k++) {
          before.set(clearOperation.indices[k], clearOperation.before[k]);
        }
      }

      set({ imageMapMessage: null });
      activeMapping = {
        parentId,
        job,
        before,
        frame: requestAnimationFrame(runMappingFrame),
      };
    },

    cancelColorMapping: () => finishMapping(false),

    clearMappedColors: () => {
      const s = get();
      const parentId = s.dominoEditingId;
      if (!parentId) return;
      get().cancelColorMapping();

      const data = useDominoDataStore.getState().get(parentId);
      const targets = s.imageMapTargets[parentId];
      if (!data || !targets || targets.length === 0) return;

      const operation = commitDominoColors(
        parentId,
        s.ddObjects[parentId],
        data,
        Array.from(targets, (index) => [index, 0] as [number, number]),
      );
      if (!operation) return;
      set((st) => ({ ...pushOperation(st.undoStack, operation), imageMapMessage: null }));
    },
  };
};