import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";

import InventoryTable from "../domino-inventory/InventoryTable";
import type { InventoryEntryId } from "../domino-inventory/object-model";
import { useStore } from "../store";
import styles from "./DominoInventoryScreen.module.css";

export default function DominoInventoryScreen() {
  const addEntry = useStore((s) => s.addInventoryEntry);
  const removeEntries = useStore((s) => s.removeInventoryEntries);
  const selectedIds = useStore((s) => s.inventorySelectedIds);
  const ids = Object.keys(selectedIds) as InventoryEntryId[];

  const onDelete = () => {
    if (ids.length === 0) return;
    const noun = ids.length === 1 ? "entry" : "entries";
    if (window.confirm(`Delete ${ids.length} selected ${noun}? This cannot be undone.`)) {
      removeEntries(ids);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <button className={styles.newButton} onClick={addEntry}>
          <RiAddLine size={16} /> New
        </button>
        <button
          className={styles.deleteButton}
          onClick={onDelete}
          disabled={ids.length === 0}
          aria-label="Delete selected"
          title="Delete selected"
        >
          <RiDeleteBinLine size={16} />
        </button>
      </div>
      <InventoryTable />
    </div>
  );
}
