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
import type { InventoryEntryId } from "../domino-inventory/object-model";
import { getImageAsset } from "./assetStore";
import { makeDominoUnderImageTest } from "./coverage";
import {
  imageMapPaletteEntries,
  type ImageMapColorScope,
  type ImageMapExcludedColorIds,
} from "./palette";
import { resolveDitherAmplitude } from "./ditherAmplitude";
import { createColorMappingJob, type ColorMappingJob } from "./mapping";
// A value import, unlike the type-only one it replaces. Safe: object-model
// already sits in this module's runtime dependencies through mapping.ts.
import {
  imageMapRecordsEqual,
  type DominoImageMap,
  type ImageMapLayer,
} from "./object-model";

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

/**
 * Shown when Use Colors is on "selected" and nothing is ticked. Unreachable
 * while the panel greys Map Colors out for exactly this case; it is here so the
 * metric's own "no colours" message can never be shown for a reason that is not
 * the metric's.
 */
const NO_PICKED_COLORS_MESSAGE =
  "No colors are selected, so there is nothing to map with. Select some swatches " +
  'or set Use Colors back to "All".';

/**
 * What was wrong, if anything, when image mapping was switched on.
 *
 * "no-dominoes" and "all-colored" are told apart deliberately: they need
 * different advice, and telling a user their dominoes are all coloured when the
 * picture is simply parked off to one side would send them looking in the wrong
 * place.
 */
export type ImageMapEntryWarning = "none" | "no-dominoes" | "all-colored";

export interface ImageMapSlice {
  /** At most one picture per element, keyed by the element's id. */
  imageMaps: Record<DDObjectId, DominoImageMap>;

  /**
   * Whether the colour-mapping sidebar is on. It is a sub-mode *within* domino
   * editing mode — deliberately not a ToolId, for the same reason the armed
   * shape and the armed brush are not: `activeTool` is already held by
   * "editDominoes" for the whole mode. View state, never document state, never
   * undoable; cleared on leaving the mode.
   *
   * Note this says nothing about whether the picture is *drawn*. It used to: the
   * overlay only existed inside this mode, which made tracing a logo with the
   * shape and brush tools impossible, since showing the picture meant giving up
   * every tool that could trace it. The picture is now an ordinary overlay of
   * domino editing mode (see modeller.tsx and underlay.ts), and this flag means
   * only "the Map Image Colors panel is up".
   */
  imageMapActive: boolean;

  /**
   * Whether Resize and Move is on — the sub-mode that puts handles on the
   * picture and hands canvas drags to ImageTransformTool.
   *
   * It is reached only from the toolbar's image menu. There is deliberately no
   * way to select the picture by clicking it, which is what let the tool's
   * click-away-to-deselect plane be deleted: that plane and DominoEditor's own
   * both covered the whole canvas at the same height, so only a mode keeping
   * them apart stopped them fighting over the same press.
   */
  imageTransformActive: boolean;

  /** Which metric the Map Colors button will use. */
  colorDistanceId: ColorDistanceId;

  /** How a patch of picture is reduced to the one colour that metric is asked about. */
  patchSampleId: PatchSampleId;

  /** Which dither pattern the Map Colors button will use. */
  ditherId: DitherId;

  /** How hard the dither nudges each domino, 0 to 1. */
  ditherStrength: number;

  /**
   * Whether a run may use every active inventory colour, or only the swatches
   * the user has ticked. The sidebar's Use Colors dropdown.
   */
  imageMapColorScope: ImageMapColorScope;

  /**
   * Which swatches are ticked, stored as the ones turned *off* — see
   * palette.ts for why that way round.
   *
   * This and imageMapColorScope are settings, not session state: neither is
   * touched by setImageMapActive, so leaving image mapping and coming back finds
   * the palette as it was left, exactly as the metric and dither choices are.
   * They sit outside imageMapTargets, which is the opposite — deliberately
   * re-frozen on every entry.
   */
  imageMapExcludedColorIds: ImageMapExcludedColorIds;

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

  /**
   * Whether switching image mapping on found anything for a run to do, and if
   * not, why — the panel raises a dialog saying so.
   *
   * Worth stopping the user for, because neither answer is visible on the
   * screen: a field of coloured dominoes looks perfectly mappable, and nothing
   * about the picture is wrong. Without this the first sign of trouble is
   * pressing Map Colors and watching nothing happen.
   *
   * Decided once, on entry, and only on entry. It is deliberately not recomputed
   * as the picture is dragged about — a modal appearing in the middle of a drag
   * would be its own kind of awful, and the count in the panel already tracks
   * that live.
   *
   * It needs no action of its own to clear it, because closing the dialog leaves
   * the mode: every control in the panel is pointless with nothing to map, and
   * leaving is the fix in both cases, since coming back takes a fresh target
   * list. setImageMapActive writes this on the way in and on the way out alike.
   */
  imageMapEntryWarning: ImageMapEntryWarning;

  setImageMapActive(active: boolean): void;
  /**
   * Turns Resize and Move on or off. Turning it on also shows the picture, since
   * there is no positioning something you cannot see — safe to fold in here
   * because `visible` is a view toggle that records no undo entry.
   */
  setImageTransformActive(active: boolean): void;
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
  /**
   * Records a change to an element's picture as one undo entry: `before` and
   * `after` are the whole record either side, or null where there was no picture.
   * So an add, a delete, a replacement and a finished move/resize are all this
   * one call.
   *
   * It only *records*. The change itself goes in separately through setImageMap
   * or clearImageMap — the same split SelectionTool makes, and what lets
   * undo/redo and discardImageMapSession reuse those without pushing operations
   * of their own.
   *
   * **Call this BEFORE applying a change that drops or replaces a picture, not
   * after.** That is backwards from every other commit point in the app, and it
   * is not a style choice. initImageMapPruning frees any decoded picture nothing
   * points at, it runs synchronously on every store write, and an operation on
   * the undo stack is one of the two things that counts as pointing at one. So
   * clearing the record first leaves a gap — one store write long — in which the
   * old picture is referenced by nothing at all, and the pruner takes that
   * moment to throw its pixels away. The operation then lands naming a picture
   * that no longer exists, and undoing it restores a record with nothing to
   * draw. Recording first means the two never both let go at once.
   *
   * A plain move or resize is exempt and records afterwards, as SelectionTool
   * does: both sides name the same picture, which is live throughout.
   *
   * Pushes nothing when nothing actually changed, so a drag that ends where it
   * began leaves the stack alone.
   */
  recordImageMapChange(
    ddObjectId: DDObjectId,
    before: DominoImageMap | null,
    after: DominoImageMap | null,
  ): void;
  /**
   * Shows or hides the picture — the toolbar image button and Ctrl+I both.
   *
   * Hiding also leaves Resize and Move, the mirror of setImageTransformActive
   * showing the picture on the way in: handles floating over nothing are no use
   * to anyone, and the alternative would be refusing to hide, which is worse for
   * a key people press without looking.
   *
   * Records nothing. Showing and hiding is a glance, like the Expand toggle.
   */
  toggleImageVisible(ddObjectId: DDObjectId): void;
  setImageMapLayer(ddObjectId: DDObjectId, layer: ImageMapLayer): void;
  setColorDistance(id: ColorDistanceId): void;
  setPatchSample(id: PatchSampleId): void;
  setDither(id: DitherId): void;
  setDitherStrength(strength: number): void;
  setImageMapColorScope(scope: ImageMapColorScope): void;
  /** Tick or untick one swatch. */
  toggleImageMapColor(entryId: InventoryEntryId): void;
  /** Tick every active swatch, or none of them — the Select All / None buttons. */
  setAllImageMapColors(picked: boolean): void;
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
    imageTransformActive: false,
    colorDistanceId: DEFAULT_COLOR_DISTANCE,
    patchSampleId: DEFAULT_PATCH_SAMPLE,
    ditherId: DEFAULT_DITHER,
    ditherStrength: DEFAULT_DITHER_STRENGTH,
    imageMapColorScope: "all",
    // Empty means every colour is in, so this needs no initialising — see
    // palette.ts on why membership is stored as the colours turned off.
    imageMapExcludedColorIds: {},
    colorMappingProgress: null,
    imageMapTargets: {},
    imageMapMessage: null,
    imageMapEntryWarning: "none",

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
      // The same pass also answers "will this achieve anything at all", which is
      // worth knowing before the user presses the button rather than after. Both
      // counts are of dominoes *the picture reaches*: a field can be mostly blank
      // and still have nothing to map, if the picture only covers the part that
      // has already been coloured in.
      let imageMapEntryWarning: ImageMapEntryWarning = "none";
      if (imageMapActive && parentId) {
        const data = useDominoDataStore.getState().get(parentId);
        const ddObject = get().ddObjects[parentId];
        const image = get().imageMaps[parentId];
        const targets: number[] = [];
        let underImage = 0;
        let unassignedUnderImage = 0;
        if (data) {
          // Undefined when there is no picture yet, or nowhere to put one. Then
          // there is nothing to warn about — the panel's Map Colors button is
          // already disabled without a picture.
          const isUnderImage =
            ddObject && image
              ? makeDominoUnderImageTest(ddObject, image, data)
              : undefined;
          for (let i = 0; i < data.count; i++) {
            const unassigned = data.colorIds[i] === 0;
            if (unassigned) targets.push(i);
            if (!isUnderImage || !isUnderImage(i)) continue;
            underImage++;
            if (unassigned) unassignedUnderImage++;
          }
          if (isUnderImage && unassignedUnderImage === 0) {
            imageMapEntryWarning = underImage === 0 ? "no-dominoes" : "all-colored";
          }
        }
        imageMapTargets = { ...imageMapTargets, [parentId]: Uint32Array.from(targets) };
      }

      // Note imageTransformActive is deliberately left alone, unlike the shape
      // and the brush. Those two interpret canvas drags and so cannot share the
      // canvas with anything; the mapping panel interprets nothing, and nudging
      // the picture while it is up is exactly what a user wants to do.
      set({
        imageMapActive,
        imageMapMessage: null,
        imageMapTargets,
        imageMapEntryWarning,
        dominoShapeSelectId: null,
        dominoShapeSelectHint: null,
        dominoBrushId: null,
      });
    },

    setImageTransformActive: (imageTransformActive) => {
      const s = get();
      const parentId = s.dominoEditingId;
      // Entering the mode shows the picture: there is no positioning something
      // that isn't on screen, and a user who picked Resize and Move off the menu
      // has said plainly that they want to see it.
      if (imageTransformActive && parentId && s.imageMaps[parentId]?.visible === false) {
        s.updateImageMap(parentId, { visible: true });
      }
      if (!imageTransformActive) {
        set({ imageTransformActive });
        return;
      }
      // Arming this takes canvas drags away from an armed shape or brush — the
      // same radio semantics those two already have with each other, and for the
      // same reason: only one thing can own a press.
      set({
        imageTransformActive,
        dominoShapeSelectId: null,
        dominoShapeSelectHint: null,
        dominoBrushId: null,
      });
    },

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
    //
    // Nothing is disposed here, deliberately. Deleting a picture is undoable
    // now, so freeing its decoded pixels on the spot would mean Ctrl+Z brought
    // back a record with nothing left to draw. initImageMapPruning in
    // assetStore.ts is the single owner of freeing, and it waits until no undo
    // entry could bring the picture back.
    clearImageMap: (ddObjectId) => {
      set((s) => {
        if (!s.imageMaps[ddObjectId]) return {};
        const imageMaps = { ...s.imageMaps };
        delete imageMaps[ddObjectId];
        return { imageMaps, imageTransformActive: false };
      });
    },

    toggleImageVisible: (ddObjectId) => {
      const s = get();
      const image = s.imageMaps[ddObjectId];
      if (!image) return;
      const visible = !image.visible;
      s.updateImageMap(ddObjectId, { visible });
      if (!visible && s.imageTransformActive) set({ imageTransformActive: false });
    },

    recordImageMapChange: (ddObjectId, before, after) => {
      if (imageMapRecordsEqual(before, after)) return;
      set((s) => ({
        ...pushOperation(s.undoStack, {
          kind: "imageMap",
          parentId: ddObjectId,
          before,
          after,
        }),
      }));
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

    // The three palette actions clear the message for the same reason the metric
    // and dither setters do: they change what a run would do, so whatever the
    // last one complained about may no longer be true.
    setImageMapColorScope: (imageMapColorScope) =>
      set({ imageMapColorScope, imageMapMessage: null }),

    toggleImageMapColor: (entryId) =>
      set((s) => {
        const imageMapExcludedColorIds = { ...s.imageMapExcludedColorIds };
        if (imageMapExcludedColorIds[entryId]) delete imageMapExcludedColorIds[entryId];
        else imageMapExcludedColorIds[entryId] = true;
        return { imageMapExcludedColorIds, imageMapMessage: null };
      }),

    setAllImageMapColors: (picked) =>
      set((s) => {
        // Ticking everything is simply "nothing excluded". Unticking lists the
        // active entries only, since an inactive one is not shown as a swatch
        // and never reaches a run anyway.
        const imageMapExcludedColorIds: ImageMapExcludedColorIds = {};
        if (!picked) {
          for (const entry of s.inventoryEntries) {
            if (entry.active) imageMapExcludedColorIds[entry.id] = true;
          }
        }
        return { imageMapExcludedColorIds, imageMapMessage: null };
      }),

    setImageMapMessage: (imageMapMessage) => set({ imageMapMessage }),

    startColorMapping: () => {
      const s = get();
      const parentId = s.dominoEditingId;
      if (!parentId || activeMapping) return;

      const ddObject = s.ddObjects[parentId];
      const image = s.imageMaps[parentId];
      const asset = image && getImageAsset(image.assetId);
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
      // Narrowed to the ticked swatches *before* the metric sees it, rather than
      // by widening what prepare() is told. That way Greyscale's own grey filter
      // simply composes on top with no change to any metric, and the amplitude
      // measured below is measured over the colours a run will really use — so
      // three chosen colours dither as three rather than as the whole inventory.
      const palette = imageMapPaletteEntries(
        s.inventoryEntries,
        s.imageMapColorScope,
        s.imageMapExcludedColorIds,
      );
      if (palette.length === 0) {
        set({ imageMapMessage: NO_PICKED_COLORS_MESSAGE });
        return;
      }
      const candidates = metric.prepare(palette);
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