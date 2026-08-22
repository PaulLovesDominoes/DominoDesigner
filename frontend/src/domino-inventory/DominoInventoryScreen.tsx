import { RiAddLine, RiDeleteBinLine, RiDownloadLine, RiUploadLine } from "@remixicon/react";

import ConfirmDialog from "../components/ConfirmDialog";
import InventoryTable from "./InventoryTable";
import type { InventoryEntryId } from "./object-model";
import { useInventoryCsv } from "./useInventoryCsv";
import { useStore } from "../store";
import styles from "./DominoInventoryScreen.module.css";

export default function DominoInventoryScreen() {
  const addInventoryEntry = useStore((s) => s.addInventoryEntry);
  const removeEntries = useStore((s) => s.removeInventoryEntries);
  const selectedIds = useStore((s) => s.inventorySelectedIds);
  // A plain number, so no useShallow is involved.
  const entryCount = useStore((s) => s.inventoryEntries.length);
  const { prompt, dismissPrompt, uploadInventoryCsv, downloadInventoryCsv } = useInventoryCsv();
  const ids = Object.keys(selectedIds) as InventoryEntryId[];

  const onDeleteInventoryEntry = () => {
    if (ids.length === 0) return;
    const entryNoun = ids.length === 1 ? "entry" : "entries";
    if (window.confirm(`Delete ${ids.length} selected ${entryNoun}? This cannot be undone.`)) {
      removeEntries(ids);
    }
  };

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <button className={styles.toolbarButton} onClick={addInventoryEntry}>
          <RiAddLine size={16} /> New
        </button>
        <button
          className={styles.toolbarButton}
          onClick={onDeleteInventoryEntry}
          disabled={ids.length === 0}
          aria-label="Delete selected"
          title="Delete selected"
        >
          <RiDeleteBinLine size={16} />
        </button>
        <button
          className={styles.toolbarButton}
          onClick={uploadInventoryCsv}
          title="Replace the whole inventory from a CSV file"
        >
          <RiUploadLine size={16} /> Upload CSV
        </button>
        <button
          className={styles.toolbarButton}
          onClick={downloadInventoryCsv}
          disabled={entryCount === 0}
          title="Save the inventory as a CSV file"
        >
          <RiDownloadLine size={16} /> Download CSV
        </button>
      </div>
      <InventoryTable />
      {prompt && (
        <ConfirmDialog
          message={prompt.message}
          confirmLabel={prompt.confirmLabel}
          cancelLabel={prompt.cancelLabel}
          onConfirm={prompt.onConfirm}
          onCancel={dismissPrompt}
          wide
        />
      )}
    </div>
  );
}