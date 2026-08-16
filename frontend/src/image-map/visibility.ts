import type { DominoImageMap } from "./object-model";

/**
 * Whether a picture is actually on screen, and how to put one back on screen.
 *
 * Two quite separate settings can make a picture invisible — the show/hide
 * toggle and winding transparency all the way up — and anything that needs a
 * picture to be *seen* has to deal with both. Undo/redo is the caller that
 * needs it: an undo whose whole effect lands on an invisible picture looks like
 * a keypress that did nothing.
 *
 * ---- Why this is its own module ----
 *
 * history/appStoreSlice.ts needs these as values, not just types. It cannot get
 * them from object-model.ts, which imports object-types/registry — a value
 * import that leads back towards store.ts, and that slice deliberately keeps
 * itself clear of any such edge (see its import-cycle note). The only import
 * here is a *type*, which TypeScript erases entirely, so nothing in the built
 * JavaScript imports anything at all and this is safe to reach from anywhere.
 */

/**
 * What a picture's transparency starts at, and what it is put back to if it has
 * been wound all the way up when something needs it seen again. Half-transparent
 * suits both jobs a picture does: solid enough to judge colours against, faint
 * enough to draw over.
 */
export const DEFAULT_IMAGE_OPACITY = 0.5;

/** Whether this picture would actually be seen if its element were being edited. */
export function isImageOnScreen(image: DominoImageMap): boolean {
  return image.visible && image.opacity > 0;
}

/**
 * The same picture, made visible if it wasn't.
 *
 * Returns the record itself when nothing needs changing, so a caller can use it
 * unconditionally without churning out new objects.
 *
 * Transparency is only touched when it is at zero — a picture the user merely
 * made faint keeps the setting they chose. The test is a literal `> 0` with no
 * margin for exactly that reason: a picture at 1% is hard to see but is
 * genuinely on screen, and treating it as invisible would quietly overwrite a
 * deliberate choice.
 */
export function imageMadeOnScreen(image: DominoImageMap): DominoImageMap {
  if (isImageOnScreen(image)) return image;
  return {
    ...image,
    visible: true,
    opacity: image.opacity > 0 ? image.opacity : DEFAULT_IMAGE_OPACITY,
  };
}