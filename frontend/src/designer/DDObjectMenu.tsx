import { useLayoutEffect, useRef, useState } from "react";
import { RiDeleteBinLine, RiPencilLine } from "@remixicon/react";

import { useStore } from "../store";
import type { DDObjectId } from "../object-types/base";
import styles from "./DDObjectMenu.module.css";

interface Props {
  ddObjectId: DDObjectId;
  /** Bounding rect of the "more" button this menu hangs off. */
  anchor: DOMRect;
  onClose: () => void;
}

/**
 * Actions for one row of the DDObject hierarchy. Follows the HamburgerMenu
 * pattern: a transparent full-screen backdrop catches the outside click, and
 * the menu itself floats above it.
 */
export default function DDObjectMenu({ ddObjectId, anchor, onClose }: Props) {
  const rootId = useStore((s) => s.rootId);
  const removeDDObject = useStore((s) => s.removeDDObject);
  const openProperties = useStore((s) => s.openProperties);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  // Keep the menu on screen: nudge it left of the viewport edge and flip it
  // above the button when there is no room below.
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(anchor.left, window.innerWidth - rect.width - 8);
    const top =
      anchor.bottom + 4 + rect.height > window.innerHeight
        ? anchor.top - rect.height - 4
        : anchor.bottom + 4;

    setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
  }, [anchor]);

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div ref={menuRef} className={styles.menu} style={pos} role="menu">
        <button
          className={styles.item}
          role="menuitem"
          // The build plane is the root of the hierarchy — there is nothing to
          // hold its children, so it cannot be deleted.
          disabled={ddObjectId === rootId}
          onClick={run(() => removeDDObject(ddObjectId))}
        >
          <RiDeleteBinLine size={16} />
          Delete
        </button>
        <button
          className={styles.item}
          role="menuitem"
          onClick={run(() => openProperties(ddObjectId))}
        >
          <RiPencilLine size={16} />
          Properties
        </button>
      </div>
    </>
  );
}
