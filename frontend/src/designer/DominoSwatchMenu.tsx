import { useLayoutEffect, useRef, useState } from "react";
import { RiEyeLine } from "@remixicon/react";

import { useStore } from "../store";
import type { DominoSwatch } from "./dominoSwatches";
import styles from "./DominoSwatchMenu.module.css";

interface Props {
  swatch: DominoSwatch;
  /** Bounding rect of the caret button this menu hangs off. */
  anchor: DOMRect;
  onClose: () => void;
}

/**
 * The per-swatch command menu: select the dominoes of this swatch, and — for the
 * Hide swatch only — unhide the ones currently selected.
 *
 * Structured after DDObjectMenu, including the reason for `position: fixed`:
 * the sidebar sets overflow-y, which makes overflow-x compute to auto as well,
 * so it clips on both axes and an absolutely positioned menu would be cut off.
 */
export default function DominoSwatchMenu({ swatch, anchor, onClose }: Props) {
  const selectDominoesBySwatch = useStore((s) => s.selectDominoesBySwatch);
  const unhideSelectedDominoes = useStore((s) => s.unhideSelectedDominoes);
  const dominoColorLockedId = useStore((s) => s.dominoColorLockedId);
  const toggleDominoColorLock = useStore((s) => s.toggleDominoColorLock);
  const applyLockedSwatchIfAny = useStore((s) => s.applyLockedSwatchIfAny);

  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  // Keep the menu on screen: nudge it left of the viewport edge and flip it
  // above the caret when there is no room below.
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
        {/* Hide only. Acts on the selection rather than on every hidden domino,
            so it pairs with this menu's own Select: select the hidden ones,
            then unhide them. */}
        {swatch.canUnhide && (
          <>
            <button
              className={styles.item}
              role="menuitem"
              onClick={run(unhideSelectedDominoes)}
            >
              <RiEyeLine size={16} />
              Unhide
            </button>
          </>
        )}
        {/* The same action the swatch's double-click runs, so only *this*
            swatch being the locked one makes it an unlock — with another swatch
            locked this still reads "Lock", and clicking it moves the lock here
            (toggleDominoColorLock replaces whatever was locked before). */}
        <button
          className={styles.item}
          role="menuitem"
          onClick={run(() => {toggleDominoColorLock(swatch.id); applyLockedSwatchIfAny();} )}
        >
          {dominoColorLockedId === swatch.id ? "Unlock" : "Lock"}
        </button>
        <div className={styles.separator} />
        <button
          className={styles.item}
          role="menuitem"
          onClick={run(() => selectDominoesBySwatch(swatch.id, "replace"))}
        >
          Select
        </button>
        <button
          className={styles.item}
          role="menuitem"
          onClick={run(() => selectDominoesBySwatch(swatch.id, "add"))}
        >
          Add Select
        </button>
        <button
          className={styles.item}
          role="menuitem"
          onClick={run(() => selectDominoesBySwatch(swatch.id, "remove"))}
        >
          Deselect
        </button>
        {/* Narrows rather than grows: of what's already selected, keep only what
            matches. Reads naturally for the specials too — on Hide it leaves
            just the hidden dominoes among those selected. */}
        <button
          className={styles.item}
          role="menuitem"
          onClick={run(() => selectDominoesBySwatch(swatch.id, "intersect"))}
        >
          Deselect others
        </button>
      </div>
    </>
  );
}