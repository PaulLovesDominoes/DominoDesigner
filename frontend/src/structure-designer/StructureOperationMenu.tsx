import { useLayoutEffect, useRef, useState } from "react";
import { RiDeleteBinLine } from "@remixicon/react";

import type { StructureOperationId } from "./operation-types/base";
import { useStructureStore } from "./store";
import styles from "./StructureOperationMenu.module.css";

/**
 * The menu behind a sidebar row's ⋯ button. One item today; it exists as its own
 * component because the popup positioning is fiddly enough to be worth keeping
 * out of the list, and because the next operation-level command lands here.
 *
 * Deleting is undoable, so it asks for no confirmation. (The trashcan inside the
 * Layer Heights list is a different thing under the same word: that one removes
 * a row from an operation being edited, and is covered by that dialog's single
 * Update or Cancel rather than by an undo entry of its own.)
 */
export default function StructureOperationMenu({
  operationId,
  anchor,
  onClose,
}: {
  operationId: StructureOperationId;
  /** Screen rectangle of the button this hangs from. */
  anchor: DOMRect;
  onClose: () => void;
}) {
  const removeOperation = useStructureStore((s) => s.removeOperation);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  // Keep the menu on screen: nudge it left of the viewport edge, and flip it
  // above the button when there is no room below. It has to run after the first
  // paint because it needs the menu's own measured size.
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(anchor.left, window.innerWidth - rect.width - 8);
    const top =
      anchor.bottom + 4 + rect.height > window.innerHeight
        ? anchor.top - rect.height - 4
        : anchor.bottom + 4;

    // Returning the previous object when nothing moved is what stops this
    // effect from setting state on every render and looping.
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
  }, [anchor]);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div ref={menuRef} className={styles.menu} style={pos} role="menu">
        <button
          className={styles.item}
          role="menuitem"
          onClick={() => {
            removeOperation(operationId);
            onClose();
          }}
        >
          <RiDeleteBinLine size={16} />
          Delete
        </button>
      </div>
    </>
  );
}