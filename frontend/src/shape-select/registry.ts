import type { AnyShapeSelectDefinition } from "./base";
import { angledRectangleSelectDefinition } from "./angledRectangle/object-model";
import { circleSelectDefinition } from "./circle/object-model";
import { circleByDiameterSelectDefinition } from "./circleByDiameter/object-model";
import { ovalSelectDefinition } from "./oval/object-model";
import { triangleSelectDefinition } from "./triangle/object-model";

// ── Register shape-select types here (name -> definition module) ──
//
// Adding a shape: create shape-select/<name>/object-model.ts exporting a
// ShapeSelectDefinition (plus its preview.tsx), then add one line here. That is
// the only central edit — the toolbar, the hint bar and DominoEditor are all
// driven off this map, and none of them names a variant. Order is toolbar
// order.
//
// The rectangle rubber band is deliberately NOT here and never will be: it is
// domino editing mode's *default* gesture, active whenever nothing is armed. It
// has a toolbar button of its own (see DominoEditingTools), but that button means
// "arm nothing" — giving it a registry entry would make "nothing armed" and
// "rectangle armed" two encodings of one state.
export const SHAPE_SELECTS = {
  circle: circleSelectDefinition,
  circleByDiameter: circleByDiameterSelectDefinition,
  oval: ovalSelectDefinition,
  triangle: triangleSelectDefinition,
  angledRectangle: angledRectangleSelectDefinition,
} satisfies Record<string, AnyShapeSelectDefinition>;

/** Union of all registered shape-select names. */
export type ShapeSelectId = keyof typeof SHAPE_SELECTS;

/**
 * Registration order, for the toolbar. A module-level constant rather than a
 * function, so a component can map it without allocating a fresh array per
 * render — and so it can never be mistaken for a store selector (React #185).
 */
export const SHAPE_SELECT_LIST: readonly AnyShapeSelectDefinition[] = Object.values(SHAPE_SELECTS);

export const getShapeSelect = (id: ShapeSelectId): AnyShapeSelectDefinition => SHAPE_SELECTS[id];