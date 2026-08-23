import { useState, type MouseEvent } from "react";
import { RiMore2Fill } from "@remixicon/react";

import {
  getOperationIcon,
  getOperationWarning,
  type StructureOperation,
} from "./operation-types/registry";
import { useStructureStore } from "./store";
import StructureOperationMenu from "./StructureOperationMenu";
import styles from "./StructureOperationList.module.css";

/**
 * The structure's operations, in build order — the recipe for putting it
 * together. The first row describes the layers from layer 1 upward and each one
 * after it carries on where the last left off, so the order here is meaning
 * rather than presentation.
 *
 * Rows are opened by double-click, matching how an element's properties are
 * opened from the Designer's hierarchy. There is deliberately **no selection**:
 * nothing on this screen would do anything with a selected operation yet, and a
 * selection nothing reads is state waiting to go stale. When something does want
 * one — reordering the list is the obvious next step — it arrives together with
 * the click-blank-space-to-deselect that has to come with it.
 */
export default function StructureOperationList() {
  const operations = useStructureStore((s) => s.operations);

  if (operations.length === 0) {
    return (
      <div className={styles.list}>
        <p className={styles.empty}>
          No operations yet. Use the toolbar to add one.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {operations.map((operation) => (
        <OperationRow
          key={operation.id}
          operation={operation}
          operations={operations}
        />
      ))}
    </div>
  );
}

function OperationRow({
  operation,
  operations,
}: {
  operation: StructureOperation;
  operations: StructureOperation[];
}) {
  const openOperationProperties = useStructureStore(
    (s) => s.openOperationProperties,
  );

  // Screen rectangle of the ⋯ button while its menu is open; null = closed. One
  // piece of state doing both jobs, since the menu needs the rectangle anyway.
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  const Icon = getOperationIcon(operation.type);
  const warning = getOperationWarning(operation, operations);

  const onDoubleClick = (e: MouseEvent<HTMLDivElement>) => {
    // Double-clicking the ⋯ button is not a double-click on the row.
    if ((e.target as HTMLElement).closest("button")) return;
    openOperationProperties(operation.id);
  };

  return (
    <>
      <div
        className={warning ? `${styles.row} ${styles.rowWarning}` : styles.row}
        onDoubleClick={onDoubleClick}
        title={warning ?? undefined}
      >
        <Icon size={16} className={styles.icon} />
        <span className={styles.name}>{operation.name}</span>
        <button
          className={menuAnchor ? `${styles.more} ${styles.moreOpen}` : styles.more}
          onClick={(e) => setMenuAnchor(e.currentTarget.getBoundingClientRect())}
          aria-label={`Actions for ${operation.name}`}
          aria-haspopup="menu"
          title="More"
        >
          <RiMore2Fill size={14} />
        </button>
      </div>

      {menuAnchor && (
        <StructureOperationMenu
          operationId={operation.id}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
        />
      )}
    </>
  );
}