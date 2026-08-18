import { useMemo } from "react";

import {
  NumberField,
  NumberPairField,
  OptionalNumberField,
  SectionHeader,
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
import { paginateLayout } from "./paginate";
import {
  PAGE_BREAK_RULES,
  PAGINATION_MODES,
  type LayoutPlanOptions,
  type PageBreakRule,
  type PaginationMode,
} from "./object-model";

/**
 * The Layout plan's options.
 *
 * The summary at the bottom is the part worth keeping: it re-paginates on every
 * change and reports the cell size, the page count and the dominoes per page the
 * settings will actually produce. All are pure functions of the plan and the
 * options, so showing them costs a memo — and under "Paginate Automatically" the
 * per-page figures are worked out rather than typed, so this is the only place
 * they appear at all.
 */
export default function LayoutPlanEditor({
  model,
  options,
  update,
}: BuildPlanOptionsProps<LayoutPlanOptions>) {
  const plan = useMemo(() => paginateLayout(model, options), [model, options]);
  const { capacity } = plan;

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

      <SectionHeader>Plan Dividers</SectionHeader>

      <NumberPairField
        label="Major/minor rows"
        first={options.majorRows}
        second={options.minorRows}
        firstLabel="Major row division"
        secondLabel="Minor row division"
        min={1}
        unit="rows"
        onChangeFirst={(majorRows) => update({ majorRows })}
        onChangeSecond={(minorRows) => update({ minorRows })}
      />
      <SelectField
        label="Break rows on"
        value={options.rowBreak}
        options={PAGE_BREAK_RULES}
        onChange={(rowBreak) => update({ rowBreak: rowBreak as PageBreakRule })}
      />
      <NumberPairField
        label="Major/minor columns"
        first={options.majorCols}
        second={options.minorCols}
        firstLabel="Major column division"
        secondLabel="Minor column division"
        min={1}
        unit="dom"
        onChangeFirst={(majorCols) => update({ majorCols })}
        onChangeSecond={(minorCols) => update({ minorCols })}
      />
      <SelectField
        label="Break columns on"
        value={options.colBreak}
        options={PAGE_BREAK_RULES}
        onChange={(colBreak) => update({ colBreak: colBreak as PageBreakRule })}
      />

      <Separator />

      <SectionHeader>Pagination</SectionHeader>
      <SelectField
        label="Pagination"
        value={options.pagination}
        options={PAGINATION_MODES}
        onChange={(mode) => update({ pagination: mode as PaginationMode })}
      />
      {/* Each mode reads one pair of fields and ignores the other, so only the
          pair in use is shown. Automatic reads neither — what it worked out
          appears in the summary below. */}
      {options.pagination === "Paginate Manually" && (
        <>
          <NumberField
            label="Rows per page"
            value={options.rowsPerPage}
            min={1}
            unit="rows"
            onChange={(rowsPerPage) => update({ rowsPerPage })}
          />
          <NumberField
            label="Dominoes per page"
            value={options.colsPerPage}
            min={1}
            unit="dom"
            onChange={(colsPerPage) => update({ colsPerPage })}
          />
        </>
      )}
      {options.pagination === "Fit to Pages" && (
        <>
          <OptionalNumberField
            label="Pages wide"
            value={options.pagesWide}
            min={1}
            unit="pg"
            placeholder="auto"
            onChange={(pagesWide) => update({ pagesWide })}
          />
          <OptionalNumberField
            label="Pages long"
            value={options.pagesLong}
            min={1}
            unit="pg"
            placeholder="auto"
            onChange={(pagesLong) => update({ pagesLong })}
          />
          {/* An axis left blank takes the count Automatic would have chosen for
              it — the fewest pages it needs at a readable size. What that came
              out as is in the summary below. */}
          <div className={styles.hint}>
            Blank values will be automatically sized to fit
          </div>
        </>
      )}

      <Separator />

      <div className={styles.summary}>
        <div>
          <strong>{plan.pages.length + 1}</strong> pages — one legend page plus{" "}
          {plan.pages.length} of grid
        </div>
        <div>
          <strong>{capacity.rowsPerPage}</strong> rows &times;{" "}
          <strong>{capacity.colsPerPage}</strong> dominoes per page
        </div>
        <div>
          Each domino prints <strong>{capacity.cellWidthMm.toFixed(1)}</strong> &times;{" "}
          <strong>{capacity.cellHeightMm.toFixed(1)}</strong> mm
        </div>
        <div>
          {model.rows} rows &times; {model.cols} columns, {model.totalDominoes} dominoes
        </div>
      </div>
      {capacity.legibilityWarning && (
        <div className={styles.warning}>{capacity.legibilityWarning}</div>
      )}
    </>
  );
}