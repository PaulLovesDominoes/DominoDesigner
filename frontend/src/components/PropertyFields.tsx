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

/** A rule between groups of rows, for editors long enough to want sections. */
export function Separator() {
  return <hr className={styles.separator} />;
}

/**
 * A named group of rows, for editors long enough that a rule alone does not say
 * what the group is. Colon-suffixed to match FieldLabel, so a heading and a
 * label read as the same kind of thing.
 */
export function SectionHeader({ children }: { children: string }) {
  return <div className={styles.sectionHeader}>{children}:</div>;
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

/** What the box shows for a value that is not there. */
const blankDraft = (value: number | null) => (value === null ? "" : String(value));

interface NumberInputProps {
  id?: string;
  value: number | null;
  min: number;
  float: boolean;
  disabled: boolean;
  /**
   * Whether clearing the box means something. Off by default, so an empty box
   * stays a transient editing state; on, an empty box commits null and the
   * setting falls back to whatever it works out for itself.
   */
  allowBlank: boolean;
  onChange: (value: number | null) => void;
  className?: string;
  /** Greyed-out text shown while the box is empty, e.g. "auto". */
  placeholder?: string;
  /** Only needed where the row's own label does not name this box. */
  ariaLabel?: string;
}

/**
 * Just the box. Split out of NumberField so a row holding two of them —
 * NumberPairField — gets the same half-typed-value handling rather than a second
 * copy of it that drifts. OptionalNumberField shares it for the same reason.
 */
function NumberInput({
  id,
  value,
  min,
  float,
  disabled,
  allowBlank,
  onChange,
  className,
  placeholder,
  ariaLabel,
}: NumberInputProps) {
  // The box holds a string so it can be empty or mid-edit while the committed
  // value stays valid.
  const [draft, setDraft] = useState(() => blankDraft(value));

  // Re-sync when the value moves underneath us — a cancelled edit rolls the
  // store back, and the box has to follow. An empty draft already matches a null
  // value, so leave it alone rather than fighting the user's own deletion.
  useEffect(() => {
    setDraft((d) => {
      if (value === null) return d === "" ? d : "";
      return parseNumber(d, float) === value ? d : String(value);
    });
  }, [value, float]);

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const text = sanitizeNumber(e.target.value, float);
    setDraft(text);

    if (allowBlank && text === "") {
      onChange(null);
      return;
    }

    const parsed = parseNumber(text, float);
    // An empty or too-small box is a transient editing state, not a value.
    // Committing it would put a zero-width plane into the scene and make the
    // camera's fit-zoom divide by zero. A half-typed "1." parses as 1, which is
    // a fine thing to commit while the draft keeps the trailing point.
    if (!Number.isNaN(parsed) && parsed >= min) onChange(parsed);
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      value={draft}
      disabled={disabled}
      onChange={change}
      // Whatever was left uncommitted snaps back to the real value.
      onBlur={() => setDraft(blankDraft(value))}
      className={className}
      placeholder={placeholder}
      aria-label={ariaLabel}
    />
  );
}

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

  const stepBy = (dir: 1 | -1) => {
    if (step === undefined) return;
    onChange(Math.max(min, value + dir * step));
  };

  const input = (
    <NumberInput
      id={id}
      value={value}
      min={min}
      float={float}
      disabled={disabled}
      // Never blank, so the box can only ever hand back a number and this
      // control's own onChange stays the simpler one every call site already has.
      allowBlank={false}
      onChange={(next) => onChange(next as number)}
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

/**
 * A number box that may be left empty.
 *
 * For a setting that can work itself out when the user says nothing — the print
 * layout's page counts are the case it was written for. Empty means null, and
 * whoever reads the setting decides what to do with that; the placeholder is how
 * the box says so ("auto").
 *
 * Deliberately a separate control rather than a flag on NumberField: an optional
 * value hands back `number | null`, and widening NumberField's onChange to match
 * would push that null onto every existing call site to no purpose.
 */
export function OptionalNumberField({
  label,
  value,
  min = 0,
  unit,
  placeholder,
  onChange,
}: FieldProps & {
  value: number | null;
  /** Values below this are treated as mid-edit and not committed. */
  min?: number;
  unit?: string;
  placeholder?: string;
  onChange: (value: number | null) => void;
}) {
  const id = useId();

  return (
    <div className={styles.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        <NumberInput
          id={id}
          value={value}
          min={min}
          float={false}
          disabled={false}
          allowBlank
          onChange={onChange}
          placeholder={placeholder}
        />
        <span className={styles.unit}>{unit ?? ""}</span>
      </div>
    </div>
  );
}

/**
 * A value worked out from other fields on the same dialog: shown, never typed
 * into.
 *
 * NumberField's `disabled` covers a derived value that is still a number the
 * control could have edited; this is for one that was never editable at all, so
 * it renders plain text and needs no onChange to ignore.
 */
export function ReadOnlyField({
  label,
  value,
  unit,
}: FieldProps & { value: string; unit?: string }) {
  return (
    <div className={`${styles.field} ${styles.fieldDisabled}`}>
      <FieldLabel>{label}</FieldLabel>
      <div className={styles.control}>
        <span className={styles.readOnlyValue}>{value}</span>
        <span className={styles.unit}>{unit ?? ""}</span>
      </div>
    </div>
  );
}

/**
 * Two numbers that belong together on one row, as in
 * `Major/minor rows: [10]/[5] rows`.
 *
 * A pair like that reads as one setting, and splitting it over two rows made the
 * print-layout options a flat list of near-identical labels. The separator is
 * part of the label's phrasing — "Major/minor" — so it stays a plain "/" rather
 * than anything configurable.
 */
export function NumberPairField({
  label,
  first,
  second,
  firstLabel,
  secondLabel,
  min = 0,
  unit,
  disabled = false,
  onChangeFirst,
  onChangeSecond,
}: FieldProps & {
  first: number;
  second: number;
  /** Names the two boxes for screen readers, since the row's label covers both. */
  firstLabel: string;
  secondLabel: string;
  min?: number;
  unit?: string;
  disabled?: boolean;
  onChangeFirst: (value: number) => void;
  onChangeSecond: (value: number) => void;
}) {
  return (
    <div className={`${styles.field} ${disabled ? styles.fieldDisabled : ""}`}>
      <FieldLabel>{label}</FieldLabel>
      <div className={styles.control}>
        {/* Neither box may be blank, so neither can hand back null. */}
        <NumberInput
          value={first}
          min={min}
          float={false}
          disabled={disabled}
          allowBlank={false}
          onChange={(next) => onChangeFirst(next as number)}
          className={styles.pairInput}
          ariaLabel={firstLabel}
        />
        <span className={styles.pairSeparator}>/</span>
        <NumberInput
          value={second}
          min={min}
          float={false}
          disabled={disabled}
          allowBlank={false}
          onChange={(next) => onChangeSecond(next as number)}
          className={styles.pairInput}
          ariaLabel={secondLabel}
        />
        <span className={styles.unit}>{unit ?? ""}</span>
      </div>
    </div>
  );
}

/**
 * An on/off tick box. Like SelectField it holds no draft — there is no such
 * thing as a half-typed checkbox, so the value is driven entirely by the caller.
 */
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

/**
 * A pull-down over a fixed set of string options. Like the other controls it
 * holds no draft: `value` is the currently-selected option, driven entirely by
 * the caller, so a value that changes underneath us (or a selection derived from
 * some other field) is reflected without extra wiring.
 */
export function SelectField({
  label,
  value,
  options,
  onChange,
}: FieldProps & {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className={styles.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        <select
          id={id}
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
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