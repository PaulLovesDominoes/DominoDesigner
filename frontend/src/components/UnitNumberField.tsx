import { useEffect, useState, type ChangeEvent } from "react";

import { roundDisplay, stepValue, UNIT_OPTIONS, type LengthUnit } from "../units";
import { FieldLabel, parseNumber, sanitizeNumber } from "./PropertyFields";
import { Steppers } from "./Steppers";
import shared from "./PropertyFields.module.css";
import wrap from "./Steppers.module.css";
import styles from "./UnitNumberField.module.css";

interface UnitNumberFieldProps {
  label: string;
  /** The current number, already expressed in `unit` — this control has no
   *  knowledge of millimetres; unit conversion is the caller's concern. */
  value: number;
  unit: LengthUnit;
  onUnitChange: (unit: LengthUnit) => void;
  onChange: (value: number) => void;
  /** In the same unit as `value`. */
  min?: number;
  disabled?: boolean;
}

/**
 * A NumberField variant with a unit dropdown and up/down steppers, generic
 * enough for any editor that wants unit-aware numeric input (today: Build
 * Plane width/height). Operates purely in display-unit space; converting to
 * whatever a DDObject actually stores is the caller's job (see
 * buildPlane/object-model.ts's withDisplay* helpers).
 */
export function UnitNumberField({
  label,
  value,
  unit,
  onUnitChange,
  onChange,
  min,
  disabled = false,
}: UnitNumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  // Re-sync when the value moves underneath us — including right after a unit
  // switch, since the caller recomputes `value` for the new unit.
  useEffect(() => {
    setDraft((d) => (parseNumber(d, true) === value ? d : String(value)));
  }, [value]);

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const text = sanitizeNumber(e.target.value, true);
    setDraft(text);

    const parsed = parseNumber(text, true);
    if (!Number.isNaN(parsed) && (min === undefined || parsed >= min)) {
      onChange(parsed);
    }
  };

  const step = (dir: 1 | -1) => {
    const next = stepValue(value, unit, dir);
    const clamped = min === undefined ? next : Math.max(min, next);
    onChange(roundDisplay(clamped, unit));
  };

  return (
    <div className={`${shared.field} ${disabled ? shared.fieldDisabled : ""}`}>
      <FieldLabel>{label}</FieldLabel>
      <div className={styles.control}>
        <div className={wrap.numberWrap}>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            onChange={change}
            onBlur={() => setDraft(String(value))}
            className={styles.input}
          />
          <Steppers onStep={step} disabled={disabled} label={label} />
        </div>
        <select
          className={styles.unitSelect}
          value={unit}
          disabled={disabled}
          onChange={(e) => onUnitChange(e.target.value as LengthUnit)}
          aria-label={`${label} unit`}
        >
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}