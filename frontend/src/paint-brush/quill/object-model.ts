import {
  PaintQuillLargeIcon,
  PaintQuillMediumIcon,
  PaintQuillSmallIcon,
} from "../../icons";
import type { DominoBrushDefinition } from "../base";
import QuillBrushPreview from "./preview";

/**
 * How wide the nib is across its short axis, in mm — fixed at every size, so
 * only the nib's *length* follows the size menu.
 *
 * That is what makes it behave like a real calligraphy pen rather than a
 * scaled-up pencil: dragging along the nib's own direction leaves a hairline,
 * dragging across it leaves a broad mark, and that contrast is the same whether
 * the nib is small or large. A little wider than a domino's 7.5mm thin
 * dimension (see dimensions.ts) so a hairline stroke reliably takes the row it
 * passes through rather than threading between two.
 *
 * It is also why this brush's sizes start higher than the pencil's: a length
 * anywhere near this width isn't a nib at all, just a blob.
 */
export const QUILL_NIB_WIDTH_MM = 10;

/** The nib's angle: lower-left to upper-right, always. */
export const QUILL_NIB_ANGLE = Math.PI / 4;

/**
 * A thin nib held at 45 degrees. Because the angle is fixed and known, turning
 * a point into the nib's own frame is two adds and a constant rather than a
 * sin/cos pair: the long axis is the direction (1,1) scaled to length 1, and the
 * short axis is (-1,1) scaled the same way.
 */
export const quillBrushDefinition: DominoBrushDefinition = {
  id: "quill",
  label: "Quill (for locked colors)",
  // Nib *length*; the width above stays put. Starts at 60 because shorter than
  // that stopped reading as a nib in use — see QUILL_NIB_WIDTH_MM and the note
  // on DOMINO_BRUSH_SIZES.
  sizeMm: { small: 60, medium: 100, large: 140 },
  sizeIcons: {
    small: PaintQuillSmallIcon,
    medium: PaintQuillMediumIcon,
    large: PaintQuillLargeIcon,
  },
  hint: "Drag to paint the locked color — the nib is widest across its angle. Esc during a stroke undoes it.",

  contains: (sizeMm, dx, dy) => {
    const along = (dx + dy) * Math.SQRT1_2;
    if (Math.abs(along) > sizeMm / 2) return false;
    const across = (dy - dx) * Math.SQRT1_2;
    return Math.abs(across) <= QUILL_NIB_WIDTH_MM / 2;
  },

  Preview: QuillBrushPreview,
};