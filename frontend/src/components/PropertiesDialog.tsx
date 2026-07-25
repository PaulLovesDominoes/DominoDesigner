import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useStore } from "../store";
import { getDDObjectEditor, getDDObjectIcon } from "../object-types/registry";
import type { DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import { TextField } from "./PropertyFields";
import styles from "./PropertiesDialog.module.css";

/**
 * The standard property-editing handler for every DDObject type. It owns the
 * dialog chrome, dragging, the shared Name field and the Save/Cancel
 * semantics; the type-specific controls come from the registry, so adding a
 * DDObject type never means editing this file.
 *
 * Edits are written straight to the store as they are typed, which is what
 * makes them visible on the canvas immediately. Cancel and Save are the only
 * two ways to close the dialog: Cancel rolls back to the snapshot taken when
 * the dialog opened, Save keeps the edits. There is deliberately no "X" button
 * or Escape shortcut — both made it too easy to lose in-progress edits.
 */
export default function PropertiesDialog() {
  const editingDDObjectId = useStore((s) => s.editingDDObjectId);

  if (!editingDDObjectId) return null;

  // Keyed so each opening starts with a freshly centred, undragged dialog.
  return <Dialog key={editingDDObjectId} ddObjectId={editingDDObjectId} />;
}

interface Point {
  x: number;
  y: number;
}

function Dialog({ ddObjectId }: { ddObjectId: DDObjectId }) {
  const ddObject = useStore((s) => s.ddObjects[ddObjectId]);
  const updateDDObject = useStore((s) => s.updateDDObject);
  const saveProperties = useStore((s) => s.saveProperties);
  const cancelProperties = useStore((s) => s.cancelProperties);

  const dialogRef = useRef<HTMLDivElement>(null);
  // null until measured — see the centring effect below.
  const [position, setPosition] = useState<Point | null>(null);
  // Grab offset within the dialog plus its size, captured at pointer-down.
  const drag = useRef<{ dx: number; dy: number; w: number; h: number } | null>(
    null,
  );

  // Centre over the canvas area on first paint. Measuring in a layout effect
  // avoids duplicating the CSS sizing rule here, and runs before paint so the
  // dialog is never seen in the wrong place.
  useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el || position) return;

    const { width, height } = el.getBoundingClientRect();
    const root = getComputedStyle(document.documentElement);
    const px = (name: string) => parseFloat(root.getPropertyValue(name)) || 0;
    const left = px("--sidebar-width");
    const top = px("--titlebar-height") + px("--toolbar-height");

    setPosition({
      x: Math.max(0, left + (window.innerWidth - left - width) / 2),
      y: Math.max(0, top + (window.innerHeight - top - height) / 2),
    });
  }, [position]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    setPosition({
      x: clamp(e.clientX - d.dx, 0, window.innerWidth - d.w),
      y: clamp(e.clientY - d.dy, 0, window.innerHeight - d.h),
    });
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // Left button only, and not when grabbing a button in the header.
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;

    drag.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // The DDObject can vanish underneath us (deleted from the row menu); the store
  // closes the dialog in that case, so this is just belt and braces.
  if (!ddObject) return null;

  const Icon = getDDObjectIcon(ddObject.type);
  const Editor = getDDObjectEditor(ddObject.type);
  const update = (patch: Partial<DDObject>) => updateDDObject(ddObjectId, patch);

  return (
    <>
      <div className={styles.scrim} />

      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-label={`${ddObject.name} properties`}
        style={
          position
            ? { left: position.x, top: position.y }
            : { visibility: "hidden" }
        }
      >
        <div
          className={styles.header}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Icon size={16} className={styles.headerIcon} />
          <h2 className={styles.title}>{ddObject.name}</h2>
        </div>

        <div className={styles.body}>
          {/* Every DDObject has a name, so the standard handler owns this one. */}
          <TextField
            label="Name"
            value={ddObject.name}
            onChange={(name) => update({ name })}
          />
          <Editor ddObject={ddObject} update={update} />
        </div>

        <div className={styles.footer}>
          <button className={styles.button} onClick={cancelProperties}>
            Cancel
          </button>
          <button
            className={`${styles.button} ${styles.primary}`}
            onClick={saveProperties}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));