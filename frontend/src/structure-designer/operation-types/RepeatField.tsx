import { useId } from "react";

import { FieldLabel, NumberInput } from "../../components/PropertyFields";
import shared from "../../components/PropertyFields.module.css";
import { REPEAT_KINDS, type RepeatKind } from "./repeat";
import styles from "./RepeatField.module.css";

/**
 * One `Label: [Forever v] [12]` row — how many layers a definition covers.
 *
 * Built the same way SpacingField next door is, which is the standing pattern
 * here for a labelled row holding a pull-down beside a number box: the shared
 * FieldLabel for the text, the shared stylesheet for the row's own two-column
 * layout, and local rules for the controls themselves.
 *
 * **The count sits beside the pull-down rather than on a row below it, and it
 * carries no label of its own.** The two are one setting read left to right —
 * "Count, twelve" — and splitting them made the dialog a list of near-identical
 * labels where the second one had nothing to add.
 *
 * **The label is a prop because the two users must not say the same word.** A
 * layer definition says `Repeat`; a grid definition says `Layers`, since a grid
 * already repeats across the plane in X and Y and a row called Repeat beside it
 * would be two kinds of repetition told apart by context. See repeat.ts.
 *
 * NumberInput rather than a plain input because a half-typed number has to stay
 * on screen while the last good value is what reaches the store, and that
 * handling is worth having in exactly one place.
 */
export default function RepeatField({
  label,
  repeat,
  count,
  onChange,
}: {
  label: string;
  repeat: RepeatKind;
  count: number;
  onChange: (patch: { repeat?: RepeatKind; repeatCount?: number }) => void;
}) {
  const id = useId();

  return (
    <div className={shared.field}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className={styles.control}>
        {/* The row's label names this control, so it takes the id. The count box
            beside it needs one of its own — see there. */}
        <select
          id={id}
          className={styles.kindSelect}
          value={repeat}
          onChange={(e) => onChange({ repeat: e.target.value as RepeatKind })}
        >
          {REPEAT_KINDS.map((kind) => (
            <option key={kind.kind} value={kind.kind}>
              {kind.label}
            </option>
          ))}
        </select>

        {/*
          The count only means anything in Count mode, so it is hidden rather
          than disabled in the other two — there is nothing to read off a greyed
          box whose value is not being used. Once is Count = 1, and Forever runs
          to the top of the structure. The same call the grid editor's Expanded
          tick box makes.

          The box keeps whatever was typed when the mode is switched away and
          back, which is why the number lives on the operation rather than here.

          It carries its own aria-label because the row's label is on the
          pull-down and says nothing about what this box holds.
        */}
        {repeat === "count" && (
          <NumberInput
            value={count}
            min={1}
            float={false}
            disabled={false}
            allowBlank={false}
            onChange={(repeatCount) => onChange({ repeatCount: repeatCount as number })}
            className={styles.countInput}
            ariaLabel={`${label} count`}
          />
        )}
      </div>
    </div>
  );
}