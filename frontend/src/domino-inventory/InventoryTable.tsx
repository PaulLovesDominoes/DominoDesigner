import { useMemo } from "react";
import { RiArrowDownSLine, RiArrowUpSLine } from "@remixicon/react";

import { useStore } from "../store";
import {
  ActiveToggleCell,
  ColorCell,
  NumberCell,
  SelectCell,
  TextCell,
} from "./TableCells";
import {
  BRAND_OPTIONS,
  FINISH_OPTIONS,
  MATERIAL_OPTIONS,
  sortInventoryEntries,
  type InventoryEntry,
  type InventoryEntryId,
  type InventorySortColumn,
} from "./object-model";
import styles from "./InventoryTable.module.css";

/**
 * Sortable header. The Select column is the one header not wired through
 * setInventorySort — a checkbox-based Select column is far more useful as
 * "select all" than as a boolean sort, so its header hosts a select-all
 * checkbox instead (see SelectAllHeader below). Notes has no header control
 * at all: the spec explicitly excludes it from sorting.
 */
function SortableHeader({
  column,
  label,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: InventorySortColumn;
  label: string;
  sortColumn: InventorySortColumn | null;
  sortDirection: "asc" | "desc";
  onSort: (column: InventorySortColumn) => void;
}) {
  const active = sortColumn === column;
  return (
    <th className={styles.sortableHeader}>
      <button type="button" className={styles.headerButton} onClick={() => onSort(column)}>
        <span>{label}</span>
        {active &&
          (sortDirection === "asc" ? (
            <RiArrowUpSLine size={14} />
          ) : (
            <RiArrowDownSLine size={14} />
          ))}
      </button>
    </th>
  );
}

function InventoryRow({ entry, selected }: { entry: InventoryEntry; selected: boolean }) {
  const toggleSelected = useStore((s) => s.toggleInventorySelected);
  const update = useStore((s) => s.updateInventoryEntry);
  const disabled = !entry.active;

  const patch = (p: Partial<InventoryEntry>) => update(entry.id, p);

  return (
    <tr className={disabled ? `${styles.row} ${styles.inactive}` : styles.row}>
      <td>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelected(entry.id)}
          aria-label={`Select ${entry.colorName}`}
        />
      </td>
      <td>
        <ActiveToggleCell active={entry.active} onChange={(active) => patch({ active })} />
      </td>
      <td>
        <NumberCell value={entry.available} disabled={disabled} onChange={(available) => patch({ available })} />
      </td>
      <td>
        <TextCell
          value={entry.colorName}
          maxLength={20}
          disabled={disabled}
          onChange={(colorName) => patch({ colorName })}
        />
      </td>
      <td>
        <ColorCell value={entry.color} disabled={disabled} onChange={(color) => patch({ color })} />
      </td>
      <td>
        <SelectCell
          value={entry.material}
          options={MATERIAL_OPTIONS}
          disabled={disabled}
          onChange={(material) => patch({ material })}
        />
      </td>
      <td>
        <SelectCell
          value={entry.finish}
          options={FINISH_OPTIONS}
          disabled={disabled}
          onChange={(finish) => patch({ finish })}
        />
      </td>
      <td>
        <SelectCell
          value={entry.brand}
          options={BRAND_OPTIONS}
          disabled={disabled}
          onChange={(brand) => patch({ brand })}
        />
      </td>
      <td>
        <TextCell
          value={entry.shortcut}
          maxLength={3}
          disabled={disabled}
          onChange={(shortcut) => patch({ shortcut })}
        />
      </td>
      <td className={styles.notesCell} title={entry.notes}>
        <TextCell
          value={entry.notes}
          maxLength={100}
          disabled={disabled}
          truncate
          onChange={(notes) => patch({ notes })}
        />
      </td>
    </tr>
  );
}

export default function InventoryTable() {
  const entries = useStore((s) => s.inventoryEntries);
  const sortColumn = useStore((s) => s.inventorySortColumn);
  const sortDirection = useStore((s) => s.inventorySortDirection);
  const setSort = useStore((s) => s.setInventorySort);
  const selectedIds = useStore((s) => s.inventorySelectedIds);
  const setAllSelected = useStore((s) => s.setAllInventorySelected);

  // Derived, not stored: sorting must never mutate inventoryEntries, and a
  // selector must never return a fresh array (see CLAUDE.md's useShallow
  // rule) — so this is a useMemo over the stored array, not part of a selector.
  // The ordering itself lives in object-model.ts, shared with the CSV export.
  const sorted = useMemo(
    () => sortInventoryEntries(entries, sortColumn, sortDirection),
    [entries, sortColumn, sortDirection],
  );

  const allIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds[id]);

  const headerProps = { sortColumn, sortDirection, onSort: setSort };

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <colgroup>
          <col className={styles.colSelect} />
          <col className={styles.colActive} />
          <col className={styles.colAvailable} />
          <col className={styles.colColorName} />
          <col className={styles.colColor} />
          <col className={styles.colMaterial} />
          <col className={styles.colFinish} />
          <col className={styles.colBrand} />
          <col className={styles.colShortcut} />
          <col className={styles.colNotes} />
        </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => setAllSelected(allIds, e.target.checked)}
                aria-label="Select all"
              />
            </th>
            <SortableHeader column="active" label="Active" {...headerProps} />
            <SortableHeader column="available" label="Available" {...headerProps} />
            <SortableHeader column="colorName" label="Color Name" {...headerProps} />
            <SortableHeader column="color" label="Color" {...headerProps} />
            <SortableHeader column="material" label="Material" {...headerProps} />
            <SortableHeader column="finish" label="Finish" {...headerProps} />
            <SortableHeader column="brand" label="Brand" {...headerProps} />
            <SortableHeader column="shortcut" label="Shortcut" {...headerProps} />
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <InventoryRow key={entry.id} entry={entry} selected={!!selectedIds[entry.id as InventoryEntryId]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}