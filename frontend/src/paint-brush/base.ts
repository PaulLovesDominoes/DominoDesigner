import type { ComponentType } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

/**
 * A paint brush is a nib you drag across the dominoes, recoloring whatever
 * passes under it — the freehand counterpart to shape-select's region gestures.
 * Two exist today (pencil and quill), and this contract is deliberately built
 * for the ones after them.
 *
 * How it differs from a shape-select variant, and why it is its own subsystem
 * rather than another entry in SHAPE_SELECTS:
 *
 * - A brush has no gesture *stages*. There is nothing to drag out and no
 *   multi-press sequence, so there is no `nextStep`, no state object and no
 *   control points (nothing extends a Shift+Arrow out of a stroke).
 * - A brush follows the cursor, so it never snaps to the element's grid.
 * - A brush *writes*. A shape only ever changes which dominoes are selected;
 *   this lays down the selected swatch as it goes.
 * - A brush carries a size menu.
 *
 * Registering these in SHAPE_SELECTS would have meant three or four optional
 * members on ShapeSelectDefinition that only brushes ever set.
 */

export type DominoBrushSizeId = "small" | "medium" | "large";

export interface DominoBrushSize {
  id: DominoBrushSizeId;
  label: string;
}

/**
 * The three sizes every brush offers — which they are, what order they come in,
 * and what they are called. Deliberately *not* how big they are: that is each
 * brush's own `sizeMm` below.
 *
 * The split is what testing forced. This array once carried the millimetres
 * too, on the reasoning that "Medium" ought to mean a comparable mark whichever
 * nib drew it. It doesn't, because the tools are not comparable at the small
 * end: 20mm is a useful single-domino dot for the round pencil, but the quill's
 * nib is fixed at QUILL_NIB_WIDTH_MM across, so a 20mm-long bar is a squat blob
 * — too short to show the thick/thin contrast the tool exists for, and barely
 * distinguishable from a small circle. The quill's smallest useful length turns
 * out to be about where the pencil's middle sits.
 *
 * What stays shared is worth keeping shared: the size *identity* is what the
 * store records per brush and what the size menu iterates, so neither of them
 * has to know a brush's actual reach.
 */
export const DOMINO_BRUSH_SIZES: readonly DominoBrushSize[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

export const DEFAULT_DOMINO_BRUSH_SIZE: DominoBrushSizeId = "medium";

export interface DominoBrushDefinition {
  /** Registry key; must match the key this definition is registered under. */
  id: string;
  /**
   * Toolbar tooltip and aria-label. Every brush names the selected colour,
   * because a brush with none draws no nib and paints nothing — the label is
   * what tells the user that is a colour they have yet to pick rather than a
   * broken tool. It also names the nib's *shape* rather than a drawing
   * implement, since the icons show a circle and a bar.
   */
  label: string;
  /** How far the nib reaches on the build plane, per size, in mm. */
  sizeMm: Record<DominoBrushSizeId, number>;
  /**
   * One glyph per size, each drawing this brush's own nib *at* that size. Both
   * the toolbar button and the size menu render these at a single pixel size:
   * the drawing carries the size, so nothing scales a glyph to imply one.
   *
   * There is deliberately no separate glyph for the tool in the abstract. The
   * button shows the size-specific drawing, so a generic one would have no
   * consumer.
   */
  sizeIcons: Record<DominoBrushSizeId, RemixiconComponentType>;
  /** ModeHintBar's sentence while this brush is armed and a swatch is selected. */
  hint: string;
  /**
   * Is a point `dx`/`dy` mm from the nib's centre inside it, at this size?
   *
   * A test on the domino's own centre point, exactly as shape-select's
   * `contains` is, and for the same reason: the Expand toggle changes how big a
   * domino is *drawn*, not where its centre sits, so a brush takes the same
   * dominoes with Expand on or off.
   *
   * A future airbrush will want a *strength* (0..1) here rather than an in/out
   * answer, since it lays down density rather than a hard footprint. Widen this
   * when that lands and can exercise it — not before.
   */
  contains(sizeMm: number, dx: number, dy: number): boolean;
  /**
   * The nib drawn at the origin — the caller puts it under the cursor.
   * `outlined` is false while merely hovering and true mid-stroke, which is the
   * whole visual difference between "this is what you would paint" and "you are
   * painting".
   */
  Preview: ComponentType<{ sizeMm: number; outlined: boolean }>;
}