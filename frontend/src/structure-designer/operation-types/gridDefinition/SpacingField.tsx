import { useId } from "react";

import { FieldLabel, NumberInput } from "../../../components/PropertyFields";
import shared from "../../../components/PropertyFields.module.css";
import { GRID_SPACING_KINDS, MIN_SPACING_MM, spacingMm } from "./junctions";
import type { GridSpacing, GridSpacingKind } from "./object-model";
import styles from "./SpacingField.module.css";

/**
 * One `Label: [type v] [value] mm` row — a distance that either comes from a
 * domino's own dimensions or is typed in.
 *
 * Built the same way components/UnitNumberField.tsx is, which is the standing
 * pattern for a labelled row holding a pull-down beside a number box: the shared
 * FieldLabel for the text, the shared stylesheet for the row's own two-column
 * layout, and local rules for the controls themselves.
 *
 * **The label column comes from the shared stylesheet on purpose.** This row
 * sits in the same column as the dialog's Name field and the rows around it, so
 * a copied column width that drifted would show up as labels out of line within
 * one dialog. The controls to the right of it are local, because a pull-down
 * this wide beside a number box is not the shape any shared control has — the
 * same split the Layer Heights list next door makes.
 *
 * NumberInput rather than a plain input because a half-typed "7." has to stay on
 * screen while 7 is what reaches the store, and that handling is worth having in
 * exactly one place.
 */
export default function SpacingField({
  label,
  spacing,
  onChange,
}: {
  label: string;
  spacing: GridSpacing;
  onChange: (spacing: GridSpacing) => void;
}) {
  const id = useId();

  return (
    <div className={shared.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        <select
          className={styles.kindSelect}
          value={spacing.kind}
          aria-label={`${label} type`}
          onChange={(e) => {
            const kind = e.target.value as GridSpacingKind;
            // Switching to Custom starts from whatever figure was on screen, so
            // the box does not jump to some earlier number the instant it
            // becomes editable.
            onChange({ kind, mm: kind === "custom" ? spacingMm(spacing) : spacing.mm });
          }}
        >
          {GRID_SPACING_KINDS.map((kind) => (
            <option key={kind.kind} value={kind.kind}>
              {kind.label}
            </option>
          ))}
        </select>

        {/*
          Only a Custom spacing holds a number of its own; the presets show what
          the chosen dimension is worth and refuse edits.
        */}
        <NumberInput
          id={id}
          value={spacingMm(spacing)}
          min={MIN_SPACING_MM}
          float
          disabled={spacing.kind !== "custom"}
          allowBlank={false}
          onChange={(mm) => onChange({ ...spacing, mm: mm as number })}
          className={styles.valueInput}
        />
        <span className={styles.unit}>mm</span>
      </div>
    </div>
  );
}