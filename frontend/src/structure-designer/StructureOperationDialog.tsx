import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { TextField } from "../components/PropertyFields";
import {
  getOperationEditor,
  getOperationIcon,
  getOperationWarning,
  type StructureOperation,
} from "./operation-types/registry";
import type { StructureOperationId } from "./operation-types/base";
import { useStructureStore } from "./store";
import styles from "./StructureOperationDialog.module.css";

/**
 * The properties dialog for a structure operation. It owns the dialog chrome,
 * dragging, the shared Name field and the Create/Update and Cancel semantics;
 * the type-specific controls come from the operation registry, so adding an
 * operation type never means editing this file.
 *
 * **Modeless.** The scrim dims the chrome around the canvas — title bar,
 * toolbar, sidebar, hint bar, layer slider — while the canvas area lifts itself
 * above it (see StructureDesignerScreen's canvasAreaRaised), so the operation's
 * preview stays bright and the view can still be panned and rotated while its
 * properties are being typed. That is the whole point of the arrangement: the
 * thing being described is visible while it is being described.
 *
 * Edits are written straight to the store as they are typed, which is what
 * makes them appear on the canvas immediately. Cancel and the primary button
 * are the only two ways to close: Cancel rolls back to the snapshot taken when
 * the dialog opened (or, for a creation, discards the operation outright), and
 * the primary button keeps the edits and records a single undo entry for the
 * whole session. There is deliberately no "X" button and no Escape shortcut —
 * on the Designer's dialog both made it too easy to lose in-progress edits, and
 * there is no reason for this one to differ.
 *
 * **Mounted inside StructureDesignerScreen**, not in App.tsx beside the
 * Designer's dialog. It is position:fixed and nothing between the app root and
 * the screen sets transform, filter, will-change or contain, so it competes for
 * stacking at the root exactly as it would from App and no ancestor's
 * overflow:hidden clips it. Mounting it in App would put a Structure Designer
 * component into the app root, keep it subscribed on every other screen, and
 * need a build-flag guard to stay out of a flag-off bundle.
 */
export default function StructureOperationDialog() {
  const modifyingOperationId = useStructureStore((s) => s.modifyingOperationId);

  if (!modifyingOperationId) return null;

  // Keyed so each opening starts with a freshly centred, undragged dialog.
  return <Dialog key={modifyingOperationId} operationId={modifyingOperationId} />;
}

interface Point {
  x: number;
  y: number;
}

function Dialog({ operationId }: { operationId: StructureOperationId }) {
  const operation = useStructureStore((s) =>
    s.operations.find((o) => o.id === operationId),
  );
  const operations = useStructureStore((s) => s.operations);
  const creating = useStructureStore((s) => s.creatingOperationId !== null);
  const updateOperation = useStructureStore((s) => s.updateOperation);
  const saveOperationProperties = useStructureStore((s) => s.saveOperationProperties);
  const cancelOperationProperties = useStructureStore(
    (s) => s.cancelOperationProperties,
  );

  const dialogRef = useRef<HTMLDivElement>(null);
  // null until measured — see the centring effect below.
  const [position, setPosition] = useState<Point | null>(null);
  // Grab offset within the dialog plus its size, captured at pointer-down.
  const drag = useRef<{ dx: number; dy: number; w: number; h: number } | null>(null);

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
    // The toolbar sits in the title bar, whose height is a CSS variable. What is
    // below it is this screen's hint bar, whose height is content-driven rather
    // than a variable, so it is measured through the id it renders. That id is
    // this screen's own — the Designer's mode-hint-bar is a different element on
    // a different screen.
    const hintHeight =
      document.getElementById("structure-hint-bar")?.getBoundingClientRect()
        .height ?? 0;
    const top = px("--titlebar-height") + hintHeight;

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
    // Capturing means the rest of the drag keeps arriving here even once the
    // pointer has left the header — over the canvas, or off the window edge.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // The operation can vanish underneath us; the store closes the dialog in that
  // case, so this is just belt and braces.
  if (!operation) return null;

  const Icon = getOperationIcon(operation.type);
  const Editor = getOperationEditor(operation.type);
  const warning = getOperationWarning(operation, operations);
  const update = (patch: Partial<StructureOperation>) =>
    updateOperation(operationId, patch);

  return (
    <>
      <div className={styles.scrim} />

      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-label={`${operation.name} properties`}
        style={
          position ? { left: position.x, top: position.y } : { visibility: "hidden" }
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
          <h2 className={styles.title}>{operation.name}</h2>
        </div>

        {warning && (
          <p className={styles.warning} role="status">
            {warning}
          </p>
        )}

        <div className={styles.body}>
          {/* Every operation has a name, so the dialog owns this one. */}
          <div className={styles.nameField}>
            <TextField
              label="Name"
              value={operation.name}
              onChange={(name) => update({ name })}
            />
          </div>
          <Editor operation={operation} update={update} />
        </div>

        <div className={styles.footer}>
          <button className={styles.button} onClick={cancelOperationProperties}>
            Cancel
          </button>
          {/*
            The primary button's wording is data rather than a constant, the way
            the build-plan dialog's is — but taken from the session rather than
            from the operation type, because every type's dialog is a
            create-or-update and per-type labels would be the same two words
            written out once each.
          */}
          <button
            className={`${styles.button} ${styles.primary}`}
            onClick={saveOperationProperties}
          >
            {creating ? "Create" : "Update"}
          </button>
        </div>
      </div>
    </>
  );
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));