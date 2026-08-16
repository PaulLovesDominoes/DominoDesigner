import { create } from "zustand";
import * as THREE from "three";

import { useStore, isDDObjectInUndoHistory } from "../store";
import type { DDObjectId } from "../object-types/base";

/**
 * The decoded form of each picture: a texture for the GPU to draw and a grid of
 * pixels for the color mapping to read.
 *
 * A store of its own, not part of the app store, for the same reason
 * domino-inventory/colorLookupStore.ts is: this is a *cache derived from* app
 * state (the data URL in the image record), not state in its own right. It holds
 * a THREE.Texture, which owns memory on the graphics card and has to be
 * explicitly disposed, and a pixel buffer of several megabytes — neither of
 * which belongs in a store whose discipline is to copy itself on every write.
 *
 * **Keyed by the picture, not by the element that shows it.** That distinction
 * is load-bearing and was not free: keyed by element there is room for exactly
 * one decoded picture per element, so loading a replacement had to throw the old
 * one's pixels away. That was fine while nothing about a picture was undoable.
 * It stopped being fine the moment replacing one became an undo entry, because
 * Ctrl+Z would then restore a record whose pixels had been freed and draw
 * nothing at all. Each decoded picture now gets its own id, several can sit here
 * at once, and initImageMapPruning below is the one thing that frees any of them.
 */

export interface ImageAsset {
  /** What the modeller draws. */
  texture: THREE.Texture;
  /** What the mapping samples. Possibly downscaled from the file — see MAX_SAMPLE_DIM. */
  pixels: ImageData;
  /** The file's own dimensions, before any downscale. */
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * The longest edge, in pixels, that the sampling copy is allowed to be.
 *
 * A phone photo is several thousand pixels across, which would be tens of
 * megabytes of ImageData held for the session, to answer questions at a
 * resolution nothing can use: even a 250x250 field — the largest anyone is
 * likely to build — only needs a handful of pixels per domino to average over.
 * The texture the user *sees* is drawn from the same downscaled canvas, which is
 * also fine: it is displayed at the size of a build plane, not inspected.
 */
const MAX_SAMPLE_DIM = 1024;

/** File types the picker offers. Also the list quoted to the user in the panel. */
export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif,image/bmp";

interface ImageAssetStore {
  assets: Record<string, ImageAsset | undefined>;
}

export const useImageAssetStore = create<ImageAssetStore>(() => ({ assets: {} }));

/**
 * Where the next decoded picture's id comes from. Plain counting, the same
 * "PREFIX-{n}" convention DDObject ids and inventory entries already use. It is
 * never reset, so an id minted earlier in the session can't come round again and
 * be mistaken for a different picture by an undo entry still holding the old one.
 */
let nextImageAssetNumber = 1;

export const getImageAsset = (assetId: string): ImageAsset | undefined =>
  useImageAssetStore.getState().assets[assetId];

/** Frees the graphics-card memory an asset holds and forgets it. */
export function disposeImageAsset(assetId: string) {
  const asset = useImageAssetStore.getState().assets[assetId];
  if (!asset) return;
  asset.texture.dispose();
  useImageAssetStore.setState((s) => {
    const assets = { ...s.assets };
    delete assets[assetId];
    return { assets };
  });
}

// Note this no longer disposes anything first: a new picture has a new id, so it
// cannot collide with one already here, and whether the previous one is still
// wanted is a question only the pruner can answer.
function putImageAsset(assetId: string, asset: ImageAsset) {
  useImageAssetStore.setState((s) => ({ assets: { ...s.assets, [assetId]: asset } }));
}

/**
 * What a successfully loaded file gives back: everything the image record needs
 * to be built from, the asset itself having already been stored.
 */
export interface LoadedImage {
  src: string;
  /** The key the decoded pixels were stored under. */
  assetId: string;
  fileName: string;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Asks the user for an image file and decodes it.
 *
 * Resolves to null if they cancel the picker, and rejects if the file turns out
 * not to be a decodable image (a .png that isn't one, say — the picker's accept
 * list filters by name and type, and neither is a guarantee).
 *
 * There is no server involved: the FastAPI app only serves the built frontend,
 * so "uploading" here means reading the file into memory in this tab. It is not
 * persisted, and neither is anything else in this app.
 */
export function pickAndLoadImage(): Promise<LoadedImage | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPTED_IMAGE_TYPES;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.onload = () => {
        const src = String(reader.result);
        decodeImage(src, file.name).then(resolve, reject);
      };
      reader.readAsDataURL(file);
    });
    // Chrome fires no event at all when the picker is dismissed in some
    // versions, so a cancelled pick simply leaves this promise pending and the
    // input to be garbage collected. Nothing is waiting on it but the caller's
    // .then, which does nothing on null anyway.
    input.click();
  });
}

/**
 * Decodes a data URL into a texture and a pixel buffer, stores them under a
 * freshly minted asset id, and reports that id along with the file's own
 * dimensions.
 *
 * Exported separately from the picker so a picture can be decoded from a src
 * already in hand, without going through a file dialog.
 */
export function decodeImage(src: string, fileName: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error(`${fileName} is not an image this browser can read.`));
    image.onload = () => {
      const naturalWidth = image.naturalWidth;
      const naturalHeight = image.naturalHeight;
      if (naturalWidth === 0 || naturalHeight === 0) {
        reject(new Error(`${fileName} has no size.`));
        return;
      }

      const scale = Math.min(1, MAX_SAMPLE_DIM / Math.max(naturalWidth, naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(naturalHeight * scale));

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        reject(new Error("This browser did not provide a 2D canvas to decode the image with."));
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      const texture = new THREE.CanvasTexture(canvas);
      // The canvas holds ordinary sRGB bytes, so three has to be told as much or
      // it treats them as already-linear and the picture draws washed out — the
      // same correction dominoes/modeller.tsx makes when it sets a domino's
      // color (see CLAUDE.md's note on SRGBColorSpace).
      texture.colorSpace = THREE.SRGBColorSpace;
      // The picture is usually drawn much larger than its own pixels, so smooth
      // between them rather than showing blocks.
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const assetId = `IMG-${nextImageAssetNumber++}`;
      putImageAsset(assetId, {
        texture,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height),
        naturalWidth,
        naturalHeight,
      });
      resolve({ src, assetId, fileName, naturalWidth, naturalHeight });
    };
    image.src = src;
  });
}

/**
 * Frees what image mapping is holding, once nothing can want it back. Call once
 * at startup, from main.tsx; returns zustand's unsubscribe.
 *
 * It does two jobs, on two different keys.
 *
 * **Sessions, keyed by DDObject.** An element's picture record and its target
 * set go when the element itself is truly gone — absent from ddObjects *and*
 * unreachable via any undo/redo. That deferral matters for the same reason it
 * does for a parent's dominoes and its color memory: a delete is undoable, so
 * freeing on the spot would mean undoing one brought the element back with its
 * picture already thrown away.
 *
 * **Decoded pixels, keyed by asset id.** This is the expensive half — a texture
 * on the graphics card plus a pixel buffer of megabytes — and this is now the
 * only thing that frees any of it, since deleting or replacing a picture is
 * undoable and so cannot free anything itself. An asset stays while any record
 * still draws it, or while any undo entry could put such a record back.
 *
 * It re-checks on undo/redo stack changes as well as on ddObjects and imageMaps,
 * since reachability can change on its own — an operation aging off the history
 * cap, or the redo stack being discarded — without either of the other two
 * changing on that update.
 */
export function initImageMapPruning() {
  return useStore.subscribe((state, prev) => {
    if (
      state.ddObjects === prev.ddObjects &&
      state.imageMaps === prev.imageMaps &&
      state.undoStack === prev.undoStack &&
      state.redoStack === prev.redoStack
    ) {
      return;
    }

    // Both keys, not just imageMaps: an element can hold a target set with no
    // picture (image mapping was switched on and nothing loaded), and that set
    // has to be freed as well.
    const ids = new Set([
      ...Object.keys(state.imageMaps),
      ...Object.keys(state.imageMapTargets),
    ]) as Set<DDObjectId>;
    for (const id of ids) {
      if (!state.ddObjects[id] && !isDDObjectInUndoHistory(id)) {
        state.discardImageMapSession(id);
      }
    }

    // Which decoded pictures something still points at. Read back off the store
    // rather than from `state`, so a record the loop above just discarded does
    // not keep its pixels alive for another round.
    const wanted = new Set<string>();
    for (const image of Object.values(useStore.getState().imageMaps)) {
      wanted.add(image.assetId);
    }
    // An undo entry holds whole records, either of which may name a picture the
    // live state no longer does — a deleted one in `before`, or one a redo would
    // bring back in `after`.
    for (const operation of [...state.undoStack, ...state.redoStack]) {
      if (operation.kind !== "imageMap") continue;
      if (operation.before) wanted.add(operation.before.assetId);
      if (operation.after) wanted.add(operation.after.assetId);
    }
    for (const assetId of Object.keys(useImageAssetStore.getState().assets)) {
      if (!wanted.has(assetId)) disposeImageAsset(assetId);
    }
  });
}