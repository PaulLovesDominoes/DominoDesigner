import type { DominoBrushDefinition } from "./base";
import { pencilBrushDefinition } from "./pencil/object-model";
import { quillBrushDefinition } from "./quill/object-model";

/**
 * Every registered paint brush. Adding one is a folder under paint-brush/ plus a
 * line here — the toolbar, the hint bar and DominoEditor are all driven off this
 * map and none of them names a brush.
 *
 * Key order is toolbar order.
 */
export const DOMINO_BRUSHES = {
  pencil: pencilBrushDefinition,
  quill: quillBrushDefinition,
} satisfies Record<string, DominoBrushDefinition>;

/** Union of all registered brush names. */
export type DominoBrushId = keyof typeof DOMINO_BRUSHES;

export const DOMINO_BRUSH_LIST: readonly DominoBrushDefinition[] = Object.values(DOMINO_BRUSHES);

export const getDominoBrush = (id: DominoBrushId): DominoBrushDefinition => DOMINO_BRUSHES[id];