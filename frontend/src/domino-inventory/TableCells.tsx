import { useEffect, useState, type ChangeEvent } from "react";
import { RiCheckboxBlankLine, RiCheckboxCircleFill } from "@remixicon/react";

import { parseNumber, sanitizeNumber } from "../components/PropertyFields";
import styles from "./TableCells.module.css";

/**
 * Bare per-column cell editors for the Domino Inventory table. These reuse the
 * draft/resync/blur-snap logic and sanitize/parse helpers from
 * components/PropertyFields.tsx, but drop its FieldLabel+.field dialog-row
 * wrapper — a <td> is the layout slot here instead.
 */

export function TextCell({
  value,
  onChange,
  disabled = false,
  maxLength,
  truncate = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  truncate?: boolean;
}) {
  return (
    <input
      type="text"
      className={truncate ? `${styles.cellInput} ${styles.truncate}` : styles.cellInput}
      value={value}
      maxLength={maxLength}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NumberCell({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  // Same draft/resync/blur-snap shape as PropertyFields' NumberField, minus
  // FieldLabel: an external change (e.g. undo, or a value that hasn't caught
  // up yet) must not clobber a value mid-edit.
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft((d) => (parseNumber(d, false) === value ? d : String(value)));
  }, [value]);

  const change = (e: ChangeEvent<HTMLInputElement>) => {
    const text = sanitizeNumber(e.target.value, false);
    setDraft(text);

    const parsed = parseNumber(text, false);
    if (!Number.isNaN(parsed) && parsed >= 0) onChange(parsed);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      className={styles.cellInput}
      value={draft}
      disabled={disabled}
      onChange={change}
      onBlur={() => setDraft(String(value))}
    />
  );
}

export function SelectCell<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className={styles.cellSelect}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorCell({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  // Same draft treatment as PropertyFields' ColorField, minus FieldLabel.
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
    <div className={styles.colorCell}>
      <input
        type="text"
        className={styles.hexInput}
        value={draft}
        disabled={disabled}
        onChange={typeHex}
        onBlur={() => setDraft(value)}
        aria-label="Color hex value"
      />
      <input
        type="color"
        className={styles.swatch}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
      />
    </div>
  );
}

export function ActiveToggleCell({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={active ? `${styles.activeToggle} ${styles.on}` : styles.activeToggle}
      onClick={() => onChange(!active)}
      aria-pressed={active}
      aria-label={active ? "Mark inactive" : "Mark active"}
      title={active ? "Active" : "Inactive"}
    >
      {active ? <RiCheckboxCircleFill size={18} /> : <RiCheckboxBlankLine size={18} />}
    </button>
  );
}
