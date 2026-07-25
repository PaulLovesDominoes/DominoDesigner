import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";

import styles from "./Steppers.module.css";

/**
 * The up/down increment buttons shared by every numeric field that steps
 * (NumberField's integer step, UnitNumberField's unit-aware step). Purely
 * presentational: it knows nothing about the value or the step size — the
 * field decides what a step means and hands back the result through onStep.
 *
 * Meant to sit inside a `position: relative` wrapper (see .numberWrap in
 * Steppers.module.css); the buttons overlay the right edge of the input, which
 * reserves room for them with its right padding.
 */
export function Steppers({
  onStep,
  disabled = false,
  label,
}: {
  onStep: (dir: 1 | -1) => void;
  disabled?: boolean;
  /** Field name, used only for the buttons' aria-labels. */
  label: string;
}) {
  return (
    <div className={styles.steppers}>
      <button
        type="button"
        className={styles.stepper}
        disabled={disabled}
        onClick={() => onStep(1)}
        aria-label={`Increase ${label}`}
        tabIndex={-1}
      >
        <RiArrowUpSLine size={11} />
      </button>
      <button
        type="button"
        className={styles.stepper}
        disabled={disabled}
        onClick={() => onStep(-1)}
        aria-label={`Decrease ${label}`}
        tabIndex={-1}
      >
        <RiArrowDownSLine size={11} />
      </button>
    </div>
  );
}