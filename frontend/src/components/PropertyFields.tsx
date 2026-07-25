import { useEffect, useId, useState, type ChangeEvent } from "react";

import { Steppers } from "./Steppers";
import styles from "./PropertyFields.module.css";
import wrap from "./Steppers.module.css";

/**
 * Labelled controls shared by every DDObject type's property editor. They write
 * through on each keystroke — the properties dialog owns Save/Cancel — so each
 * one guards against committing a half-typed value that the scene can't render.
 */

interface FieldProps {
  label: string;
}

/**
 * The shared label column: right-justified against the grid's fixed label
 * column (see PropertyFields.module.css) and always colon-suffixed. Exported
 * so UnitNumberField.tsx (a separate control, but still a field row) renders
 * an identical label rather than duplicating this formatting.
 */
export function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: string;
}) {
  return (
    <label className={styles.label} htmlFor={htmlFor}>
      {children}:
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
}: FieldProps & { value: string; onChange: (value: string) => void }) {
  const id = useId();

  return (
    <div className={styles.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * Strip everything the field can't accept. Integer fields keep digits only;
 * float fields also keep a single decimal point (the first one typed — the rest
 * are dropped so "1.2.3" can't reach the parser). Exported for UnitNumberField,
 * which needs the same float-mode sanitizing/parsing over a converted display
 * value rather than a raw DDObject field.
 */
export const sanitizeNumber = (raw: string, float: boolean) => {
  if (!float) return raw.replace(/[^0-9]/g, "");

  const cleaned = raw.replace(/[^0-9.]/g, "");
  const point = cleaned.indexOf(".");
  if (point === -1) return cleaned;
  return (
    cleaned.slice(0, point + 1) + cleaned.slice(point + 1).replace(/\./g, "")
  );
};

export const parseNumber = (text: string, float: boolean) =>
  float ? parseFloat(text) : parseInt(text, 10);

export function NumberField({
  label,
  value,
  min = 0,
  unit,
  step,
  float = false,
  disabled = false,
  onChange,
}: FieldProps & {
  value: number;
  /** Values below this are treated as mid-edit and not committed. */
  min?: number;
  unit?: string;
  /** When set, show up/down steppers that commit value ± step (clamped to min). */
  step?: number;
  /** Accept a decimal point. Integer-only by default. */
  float?: boolean;
  /** Show the value but refuse edits — for a value derived from other fields. */
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  // The box holds a string so it can be empty or mid-edit while the committed
  // value stays valid.
  const [draft, setDraft] = useState(String(value));

  // Re-sync when the value moves underneath us — a cancelled edit rolls the
  // store back, and the box has to follow.
  useEffect(() => {
    setDraft((d) => (parseNumber(d, float) === value ? d : String(value)));
  }, [value, float]);

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const text = sanitizeNumber(e.target.value, float);
    setDraft(text);

    const parsed = parseNumber(text, float);
    // An empty or too-small box is a transient editing state, not a value.
    // Committing it would put a zero-width plane into the scene and make the
    // camera's fit-zoom divide by zero. A half-typed "1." parses as 1, which is
    // a fine thing to commit while the draft keeps the trailing point.
    if (!Number.isNaN(parsed) && parsed >= min) onChange(parsed);
  };

  const stepBy = (dir: 1 | -1) => {
    if (step === undefined) return;
    onChange(Math.max(min, value + dir * step));
  };

  const input = (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      onChange={change}
      // Whatever was left uncommitted snaps back to the real value.
      onBlur={() => setDraft(String(value))}
      className={step !== undefined ? styles.stepInput : undefined}
    />
  );

  return (
    <div
      className={`${styles.field} ${disabled ? styles.fieldDisabled : ""}`}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        {step === undefined ? (
          input
        ) : (
          <div className={wrap.numberWrap}>
            {input}
            <Steppers onStep={stepBy} disabled={disabled} label={label} />
          </div>
        )}
        <span className={styles.unit}>{unit ?? ""}</span>
      </div>
    </div>
  );
}

export function CheckboxField({
  label,
  value,
  onChange,
}: FieldProps & { value: boolean; onChange: (value: boolean) => void }) {
  const id = useId();

  return (
    <div className={styles.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        <input
          id={id}
          className={styles.checkbox}
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
        />
      </div>
    </div>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorField({
  label,
  value,
  onChange,
}: FieldProps & { value: string; onChange: (value: string) => void }) {
  const id = useId();
  // Same draft treatment as NumberField: "#c8b2" is a valid thing to be typing
  // and an invalid thing to render.
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft((d) => (d.toLowerCase() === value.toLowerCase() ? d : value));
  }, [value]);

  const typeHex = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDraft(next);
    if (HEX.test(next)) onChange(next.toLowerCase());
  };

  return (
    <div className={styles.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        <input
          className={styles.hex}
          type="text"
          value={draft}
          onChange={typeHex}
          onBlur={() => setDraft(value)}
          aria-label={`${label} hex value`}
        />
        {/* The native picker already speaks "#rrggbb", which is exactly the
            shape the DDObject model stores. */}
        <input
          id={id}
          className={styles.swatch}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
        />
      </div>
    </div>
  );
}