import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { RiDeleteBinLine, RiDraggable } from "@remixicon/react";

import { NumberInput } from "../../../components/PropertyFields";
import {
  DEFAULT_CUSTOM_HEIGHT_MM,
  LAYER_HEIGHT_KINDS,
  layerRowHeightMm,
  moveLayerRow,
} from "./layers";
import type { LayerHeightKind, LayerHeightRow } from "./object-model";
import styles from "./LayerHeightList.module.css";

/**
 * The Layer Heights list: one row per layer this definition describes, in build
 * order, plus a blank row at the bottom to add another.
 *
 * **This deliberately lives here rather than in components/PropertyFields.tsx.**
 * That file holds controls with no opinion about either half of the app, which
 * is what makes it safe for both to share. This list is nothing but opinions
 * about one editor — that the Type pull-down decides whether its neighbour can
 * be typed into, that a blank row commits when a type is chosen, that the grip
 * and the trashcan appear on hover — so putting it there would drop a control no
 * Designer editor uses into the file every Designer editor imports. If a
 * Designer-side editor ever wants a list like this, that is the moment to lift
 * the general parts out, not before.
 *
 * What it *does* share is the number box itself (`NumberInput`), because a
 * half-typed "7." has to stay on screen while 7 is what reaches the store, and
 * that handling is worth having in exactly one place.
 */

/**
 * Row height in pixels. **Must match `--layer-row-height` in
 * LayerHeightList.module.css** — the drag divides by this to work out which gap
 * the pointer is over, so if the two drift the drop lands somewhere other than
 * where the line was drawn. Nothing checks it.
 */
const LAYER_ROW_HEIGHT_PX = 34;

/** How close to an edge the pointer must get before the list scrolls itself. */
const AUTO_SCROLL_EDGE_PX = 18;

/** How fast it scrolls then, in pixels per animation frame. */
const AUTO_SCROLL_SPEED_PX = 6;

/**
 * A height below this is treated as still being typed rather than as a value, so
 * the store never holds a layer with no thickness. Small enough that any real
 * measurement can still be typed one character at a time.
 */
const MIN_LAYER_HEIGHT_MM = 0.1;

interface DragState {
  fromIndex: number;
  pointerId: number;
  /** Last pointer position, so the auto-scroll can re-ask where it is. */
  clientY: number;
}

export default function LayerHeightList({
  heights,
  onChange,
}: {
  heights: readonly LayerHeightRow[];
  onChange: (heights: LayerHeightRow[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  // Which gap the row would land in, or null when no drag is running. Local
  // state: the list only moves when the drag finishes.
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const setRow = (index: number, row: LayerHeightRow) =>
    onChange(heights.map((r, i) => (i === index ? row : r)));

  const deleteRow = (index: number) =>
    onChange(heights.filter((_, i) => i !== index));

  /** Choosing a type in the blank row is what turns it into a real one. */
  const addRow = (kind: LayerHeightKind) =>
    onChange([...heights, { kind, mm: DEFAULT_CUSTOM_HEIGHT_MM }]);

  const dropIndexAt = useCallback(
    (clientY: number) => {
      const list = listRef.current;
      if (!list) return 0;
      const rect = list.getBoundingClientRect();
      // Measured against the scrolled content, not the visible box, so the
      // answer stays right while the list scrolls under the pointer.
      const y = clientY - rect.top + list.scrollTop;
      const gap = Math.round(y / LAYER_ROW_HEIGHT_PX);
      return Math.max(0, Math.min(heights.length, gap));
    },
    [heights.length],
  );

  const stopAutoScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    setDropIndex(null);
    stopAutoScroll();
  }, [stopAutoScroll]);

  /**
   * Scrolls the list while the pointer is held near one of its edges, so a row
   * can be dragged to a position that is not currently on screen.
   *
   * It re-asks for the drop index on every frame rather than waiting for the
   * next pointermove: the pointer is not moving, the *content* is, and without
   * this the insertion line would sit frozen while the rows slid past under it.
   */
  const autoScrollFrame = useCallback(() => {
    const list = listRef.current;
    const drag = dragRef.current;
    if (!list || !drag) return;

    const rect = list.getBoundingClientRect();
    const fromTop = drag.clientY - rect.top;
    const fromBottom = rect.bottom - drag.clientY;

    let dy = 0;
    if (fromTop < AUTO_SCROLL_EDGE_PX) dy = -AUTO_SCROLL_SPEED_PX;
    else if (fromBottom < AUTO_SCROLL_EDGE_PX) dy = AUTO_SCROLL_SPEED_PX;

    if (dy !== 0) {
      list.scrollTop += dy;
      setDropIndex(dropIndexAt(drag.clientY));
    }

    scrollFrameRef.current = requestAnimationFrame(autoScrollFrame);
  }, [dropIndexAt]);

  const onGripPointerDown = (index: number) => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // Stops the browser starting a text selection or a drag of its own, which
    // would take the pointer away mid-gesture.
    e.preventDefault();
    dragRef.current = { fromIndex: index, pointerId: e.pointerId, clientY: e.clientY };
    setDropIndex(index);
    // Capturing is what lets the drag keep working once the pointer wanders off
    // the grip — over another row, or out of the list entirely.
    e.currentTarget.setPointerCapture(e.pointerId);
    stopAutoScroll();
    scrollFrameRef.current = requestAnimationFrame(autoScrollFrame);
  };

  const onGripPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    drag.clientY = e.clientY;
    setDropIndex(dropIndexAt(e.clientY));
  };

  const onGripPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const to = dropIndexAt(e.clientY);
    // Dropping a row back into either gap touching its own place is a no-op —
    // and writing it anyway would record the whole session as a change.
    if (to !== drag.fromIndex && to !== drag.fromIndex + 1) {
      onChange(moveLayerRow(heights, drag.fromIndex, to));
    }

    e.currentTarget.releasePointerCapture(e.pointerId);
    endDrag();
  };

  // Escape backs out of a drag. Clearing the ref is also what makes the
  // pointerup that follows do nothing, so there is no second path to guard.
  useEffect(() => {
    if (dropIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") endDrag();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dropIndex, endDrag]);

  // A drag interrupted by the dialog closing must not leave a frame loop behind.
  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const dragging = dragRef.current;

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <span />
        <span>Type</span>
        <span className={styles.headerHeight}>Height (mm)</span>
        <span />
      </div>

      <div ref={listRef} className={styles.list}>
        {heights.map((row, index) => (
          <div
            key={index}
            className={
              dragging?.fromIndex === index
                ? `${styles.row} ${styles.dragging}`
                : styles.row
            }
          >
            <button
              className={`${styles.rowAction} ${styles.grip}`}
              aria-label={`Reorder layer ${index + 1}`}
              title="Drag to reorder"
              onPointerDown={onGripPointerDown(index)}
              onPointerMove={onGripPointerMove}
              onPointerUp={onGripPointerUp}
              onPointerCancel={endDrag}
            >
              <RiDraggable size={16} />
            </button>

            <select
              className={styles.select}
              value={row.kind}
              aria-label={`Layer ${index + 1} type`}
              onChange={(e) =>
                setRow(index, { ...row, kind: e.target.value as LayerHeightKind })
              }
            >
              {LAYER_HEIGHT_KINDS.map((kind) => (
                <option key={kind.kind} value={kind.kind}>
                  {kind.label}
                </option>
              ))}
            </select>

            {/*
              Only a Custom row holds a number of its own; every other kind shows
              what its type is worth and refuses edits.
            */}
            <NumberInput
              value={layerRowHeightMm(row)}
              min={MIN_LAYER_HEIGHT_MM}
              float
              disabled={row.kind !== "custom"}
              allowBlank={false}
              onChange={(mm) => setRow(index, { ...row, mm: mm as number })}
              className={styles.heightInput}
              ariaLabel={`Layer ${index + 1} height in millimetres`}
            />

            <button
              className={`${styles.rowAction} ${styles.trash}`}
              aria-label={`Delete layer ${index + 1}`}
              title="Delete"
              onClick={() => deleteRow(index)}
            >
              <RiDeleteBinLine size={15} />
            </button>
          </div>
        ))}

        {/*
          The blank row. It is not stored — the list always draws one below the
          real rows, and choosing a type in it is what appends a real one and
          leaves a fresh blank row in its place. That keeps the stored kinds a
          closed set with no "nothing chosen yet" member in it.
        */}
        <div className={styles.row}>
          <span />
          <select
            className={styles.select}
            value=""
            aria-label="Add a layer"
            onChange={(e) => addRow(e.target.value as LayerHeightKind)}
          >
            <option value="" disabled>
              Add layer…
            </option>
            {LAYER_HEIGHT_KINDS.map((kind) => (
              <option key={kind.kind} value={kind.kind}>
                {kind.label}
              </option>
            ))}
          </select>
          <span />
          <span />
        </div>

        {dropIndex !== null && (
          <div
            className={styles.dropLine}
            style={{ top: dropIndex * LAYER_ROW_HEIGHT_PX - 1 }}
          />
        )}
      </div>
    </div>
  );
}