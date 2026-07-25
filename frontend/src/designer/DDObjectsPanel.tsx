import { useState, type MouseEvent } from "react";
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiMore2Fill,
} from "@remixicon/react";

import { useStore } from "../store";
import { getDDObjectIcon, isDDObjectSelectable } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import DDObjectMenu from "./DDObjectMenu";
import styles from "./DDObjectsPanel.module.css";

// Indent applied per level of depth, in px.
const INDENT = 14;

interface RowProps {
  ddObjectId: DDObjectId;
  depth: number;
}

/**
 * One row of the hierarchy: the DDObject's type icon, its user-friendly name and
 * a hover-revealed actions button. DDObjects that can have children render a
 * folder-style expand/collapse chevron and recurse into them.
 */
function ObjectRow({ ddObjectId, depth }: RowProps) {
  const ddObject = useStore((s) => s.ddObjects[ddObjectId]);
  const selected = useStore((s) => s.selectedDDObjectId === ddObjectId);
  const selectDDObject = useStore((s) => s.selectDDObject);
  const [expanded, setExpanded] = useState(true);
  // Anchor rect of the "more" button while its menu is open; null = closed.
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  // A DDObject may be removed from the store while a parent still lists it.
  if (!ddObject) return null;

  const children = "children" in ddObject ? ddObject.children : [];
  const hasChildren = children.length > 0;
  const Icon = getDDObjectIcon(ddObject.type);
  const selectable = isDDObjectSelectable(ddObject);

  const openMenu = (e: MouseEvent<HTMLButtonElement>) =>
    setMenuAnchor(e.currentTarget.getBoundingClientRect());

  // Clicking the row selects the DDObject — except on the chevron/⋯ buttons,
  // which keep their own behaviour (same closest("button") guard the properties
  // dialog uses for its drag handle). Non-selectable types (the root plane) are
  // inert.
  const onRowClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    if (selectable) selectDDObject(ddObjectId);
  };

  return (
    <>
      <div
        className={`${styles.row} ${selected ? styles.selected : ""}`}
        style={{ paddingLeft: depth * INDENT }}
        onClick={onRowClick}
      >
        {hasChildren ? (
          <button
            className={styles.chevron}
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <RiArrowDownSLine size={14} />
            ) : (
              <RiArrowRightSLine size={14} />
            )}
          </button>
        ) : (
          <span className={styles.chevronSpacer} />
        )}
        <Icon size={16} className={styles.icon} />
        <span className={styles.name}>{ddObject.name}</span>
        <button
          className={`${styles.more} ${menuAnchor ? styles.moreOpen : ""}`}
          onClick={openMenu}
          aria-label={`Actions for ${ddObject.name}`}
          aria-haspopup="menu"
          title="More"
        >
          <RiMore2Fill size={14} />
        </button>
      </div>

      {menuAnchor && (
        <DDObjectMenu
          ddObjectId={ddObjectId}
          anchor={menuAnchor}
          onClose={() => setMenuAnchor(null)}
        />
      )}

      {hasChildren &&
        expanded &&
        children.map((childId) => (
          <ObjectRow key={childId} ddObjectId={childId} depth={depth + 1} />
        ))}
    </>
  );
}

/**
 * The sidebar's DDObject hierarchy, traversed from the root BuildPlane down
 * through its children. Driven by the store, so it updates automatically as
 * DDObjects are created.
 */
export default function DDObjectsPanel() {
  const rootId = useStore((s) => s.rootId);
  const selectDDObject = useStore((s) => s.selectDDObject);

  return (
    <div
      className={styles.tree}
      // A click on the blank space below the rows (the container itself, not a
      // row) deselects; row clicks select and don't reach here.
      onClick={(e) => {
        if (e.target === e.currentTarget) selectDDObject(null);
      }}
    >
      <ObjectRow ddObjectId={rootId} depth={0} />
    </div>
  );
}