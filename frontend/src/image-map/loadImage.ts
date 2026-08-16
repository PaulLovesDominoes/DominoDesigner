import { useStore } from "../store";
import { getDDObjectBounds } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import { pickAndLoadImage } from "./assetStore";
import { coverPlacement, imageOriginFor } from "./object-model";
import { DEFAULT_IMAGE_OPACITY } from "./visibility";

/**
 * Asking the user for a picture and laying it over an element.
 *
 * A plain function rather than a store action or a component's own handler,
 * because three different things start it — the toolbar's image button, that
 * button's New Image menu item, and Ctrl+I when there is nothing loaded yet —
 * and one of those is a keydown handler with no component to hang it off. It
 * reads and writes the store imperatively for the same reason.
 */

/**
 * Picks a file, decodes it, and lays it over `ddObjectId`, replacing whatever
 * was there. Does nothing if the user cancels the file dialog.
 *
 * Recorded as one undo entry, so Ctrl+Z takes the picture away again — and takes
 * a *replacement* back to the picture it replaced, which works because the one
 * it replaced still has its decoded pixels (see assetStore.ts).
 *
 * A file that turns out not to be readable leaves its complaint in
 * `imageMapMessage` rather than throwing, so nothing calling this needs a catch
 * of its own.
 */
export async function loadImageForElement(ddObjectId: DDObjectId): Promise<void> {
  useStore.getState().setImageMapMessage(null);
  try {
    const loaded = await pickAndLoadImage();
    if (!loaded) return;

    // Read the store again rather than reusing anything from before the await:
    // a file dialog is open for as long as the user wants it to be, and the
    // element could have been resized or moved meanwhile.
    const store = useStore.getState();
    const ddObject = store.ddObjects[ddObjectId];
    const bounds = ddObject && getDDObjectBounds(ddObject);
    const origin = ddObject && imageOriginFor(ddObject);
    if (!bounds || !origin) return;

    const before = store.imageMaps[ddObjectId] ?? null;
    const after = {
      ...loaded,
      ...coverPlacement(bounds, origin, loaded.naturalWidth, loaded.naturalHeight),
      opacity: DEFAULT_IMAGE_OPACITY,
      visible: true,
      // Under the painted dominoes by default, which suits both jobs a picture
      // does: colours land in front of it as they are mapped, and when tracing
      // by hand the picture stays visible exactly where no domino has been
      // painted yet.
      layer: "below" as const,
    };
    // Recorded before it is applied, which matters when this replaces a picture
    // rather than adding the first one — see recordImageMapChange, which
    // explains why the other order would lose the replaced picture's pixels.
    store.recordImageMapChange(ddObjectId, before, after);
    store.setImageMap(ddObjectId, after);
  } catch (error) {
    useStore.getState().setImageMapMessage((error as Error).message);
  }
}