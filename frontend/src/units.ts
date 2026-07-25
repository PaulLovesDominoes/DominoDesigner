/**
 * Display-unit conversion for numeric property fields. Kept separate from
 * dimensions.ts (the domino's own physical size) — this is purely about how a
 * value the user typed gets converted to/from the millimetres every DDObject
 * stores internally.
 */

export type LengthUnit = "mm" | "m" | "ft" | "in";
export const DEFAULT_DISPLAY_UNIT = "m";

const MM_PER_UNIT: Record<LengthUnit, number> = {
  mm: 1,
  m: 1000,
  ft: 304.8,
  in: 25.4,
};

export const UNIT_OPTIONS: LengthUnit[] = ["mm", "m", "ft", "in"];

/** Stepper increment for each unit, in that unit's own scale. */
export const UNIT_STEP: Record<LengthUnit, number> = {
  mm: 100,
  ft: 0.25,
  m: 0.1,
  in: 6,
};

/** Decimal places a display value is rounded to, per unit. */
const UNIT_PRECISION: Record<LengthUnit, number> = {
  mm: 0,
  m: 3,
  ft: 2,
  in: 1,
};

export const toMm = (value: number, unit: LengthUnit) => value * MM_PER_UNIT[unit];

export const fromMm = (mm: number, unit: LengthUnit) => mm / MM_PER_UNIT[unit];

/**
 * Round a *display* value to the unit's precision (see UNIT_PRECISION). Only
 * ever applied when reformatting for the user (e.g. after a unit switch or an
 * arrow-key step) — never applied to the canonical stored millimetre value,
 * and never to freely-typed input.
 */
export const roundDisplay = (value: number, unit: LengthUnit) => {
  const factor = 10 ** UNIT_PRECISION[unit];
  return Math.round(value * factor) / factor;
};

export const roundMmToDisplayToMm = (value: number, unit: LengthUnit) => {
  return toMm(roundDisplay(fromMm(value,unit),unit),unit);
}

/**
 * Snap to the next/previous multiple of UNIT_STEP[unit] from `value`,
 * matching native <input type=number step> semantics: floor-then-+1 going
 * up, ceil-then--1 going down. That means an off-grid value (e.g. 1.52 with a
 * 0.1 step) always lands on the nearest grid line in the direction of travel
 * (1.6), rather than value + step (1.62). The epsilon guards against
 * `value / step` landing a hair off an integer due to float error and
 * flipping the floor/ceil to the wrong side.
 */
const STEP_EPSILON = 1e-9;

export const stepValue = (value: number, unit: LengthUnit, direction: 1 | -1) => {
  const step = UNIT_STEP[unit];
  const ratio = value / step;
  const index =
    direction === 1
      ? Math.floor(ratio + STEP_EPSILON) + 1
      : Math.ceil(ratio - STEP_EPSILON) - 1;
  return roundDisplay(index * step, unit);
};