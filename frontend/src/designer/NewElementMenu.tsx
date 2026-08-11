import { useLayoutEffect, useRef, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";

import { useStore } from "../store";
import { getDDObjectIcon } from "../object-types/registry";
import { PLACEMENT_TOOLS } from "./toolConfig";
import styles from "./NewElementMenu.module.css";

/**
 * Replaces the old single "Field" toolbar button. Follows DDObjectMenu.tsx's
 * popup pattern: local open state, a position:fixed menu anchored to the
 * button's own rect (computed in a layout effect, since the button's screen
 * position depends on the sidebar width + toolbar layout, not a fixed
 * offset), and a transparent full-viewport backdrop that closes it.
 */
export default function NewElementMenu() {
  const startNewElement = useStore((s) => s.startNewElement);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  // Every entry in this menu arms the one "newElement" tool, so the trigger's
  // active state is that single comparison rather than a search of the list.
  const active = useStore((s) => s.activeTool === "newElement");

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setPos({ left: anchor.left, top: anchor.bottom + 4 });
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className={active ? `${styles.newBtn} ${styles.active}` : styles.newBtn}
        onClick={() => setOpen((o) => !o)}
        title="New"
        aria-label="New"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        New
        <RiArrowDownSLine size={14} />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu} style={pos} role="menu">
            {PLACEMENT_TOOLS.map((tool) => {
              // The type's own icon, so a type is never shown under one glyph
              // here and a different one in the hierarchy panel.
              const Icon = getDDObjectIcon(tool.elementType);
              return (
                <button
                  key={tool.elementType}
                  className={styles.item}
                  role="menuitem"
                  onClick={() => {
                    startNewElement(tool.elementType);
                    setOpen(false);
                  }}
                >
                  <Icon size={16} />
                  {tool.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}