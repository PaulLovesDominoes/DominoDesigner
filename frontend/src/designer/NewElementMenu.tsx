import { useLayoutEffect, useRef, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";

import { useStore } from "../store";
import { TOOLS } from "./toolConfig";
import styles from "./NewElementMenu.module.css";

// Element-creation tools only ("select" is the sole non-creation entry in
// TOOLS) — sourced from the registry-driven toolConfig, not hardcoded, so a
// second placeable type needs no changes here to appear in this menu.
const CREATION_TOOLS = TOOLS.filter((t) => t.elementType);

/**
 * Replaces the old single "Field" toolbar button. Follows DDObjectMenu.tsx's
 * popup pattern: local open state, a position:fixed menu anchored to the
 * button's own rect (computed in a layout effect, since the button's screen
 * position depends on the sidebar width + toolbar layout, not a fixed
 * offset), and a transparent full-viewport backdrop that closes it.
 */
export default function NewElementMenu() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const active = CREATION_TOOLS.some((t) => t.id === activeTool);

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
            {CREATION_TOOLS.map((tool) => (
              <button
                key={tool.id}
                className={styles.item}
                role="menuitem"
                onClick={() => {
                  setTool(tool.id);
                  setOpen(false);
                }}
              >
                <tool.Icon size={16} />
                {tool.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}