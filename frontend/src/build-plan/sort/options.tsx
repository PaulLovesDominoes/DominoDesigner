import { useMemo } from "react";

import {
  CheckboxField,
  NumberField,
  SelectField,
  Separator,
} from "../../components/PropertyFields";
import type { BuildPlanOptionsProps } from "../base";
import {
  PAGE_ORIENTATION_OPTIONS,
  PAPER_SIZE_OPTIONS,
  type PageOrientation,
  type PaperSizeId,
} from "../paper";
import styles from "../planOptions.module.css";
import { encodeSortRows } from "./encode";
import type { SortPlanOptions } from "./object-model";

/**
 * The Sort Plan's options.
 *
 * Fewer than the layout's, because paper barely constrains this document — the
 * pages are measured in the browser rather than worked out here, so there is no
 * capacity to choose and nothing to warn about.
 */
export default function SortPlanEditor({
  model,
  options,
  update,
}: BuildPlanOptionsProps<SortPlanOptions>) {
  const rows = useMemo(() => encodeSortRows(model, options), [model, options]);

  const runCount = useMemo(
    () =>
      rows.reduce(
        (total, row) =>
          total + row.batches.reduce((sum, batch) => sum + batch.length, 0),
        0,
      ),
    [rows],
  );

  return (
    <>
      <SelectField
        label="Orientation"
        value={options.orientation}
        options={PAGE_ORIENTATION_OPTIONS}
        onChange={(o) => update({ orientation: o as PageOrientation })}
      />
      <SelectField
        label="Paper size"
        value={options.paper}
        options={PAPER_SIZE_OPTIONS}
        onChange={(paper) => update({ paper: paper as PaperSizeId })}
      />

      <Separator />

      <CheckboxField
        label="Batching"
        value={options.batching}
        onChange={(batching) => update({ batching })}
      />
      <NumberField
        label="Dominoes per batch"
        value={options.batchSize}
        min={1}
        unit="dom"
        disabled={!options.batching}
        onChange={(batchSize) => update({ batchSize })}
      />

      <div className={styles.summary}>
        <div>
          <strong>{rows.length}</strong> rows, <strong>{runCount}</strong> runs to count
          out
        </div>
        <div>
          {model.totalDominoes} dominoes
          {model.skipCount > 0 ? ` and ${model.skipCount} gaps` : ""}
        </div>
        <div>Pages are worked out when the plan opens, from how much text fits.</div>
      </div>
    </>
  );
}