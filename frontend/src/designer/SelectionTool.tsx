import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useShallow } from "zustand/shallow";
import { EdgesGeometry, PlaneGeometry } from "three";

import { useStore } from "../store";
import {
  applyDDObjectBounds,
  getDDObjectBounds,
  isDDObjectSelectable,
  isDominoEditable,
} from "../object-types/registry";
import type { DDObject } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";
import type { Bounds } from "../types";
import {
  RESIZE_HANDLES,
  cursorFor,
  handlePos,
  type ResizeHandleId,
} from "./resizeHandles";

// Z layering, lowest first. Picking planes sit just above the build plane (a
// domino in front of them is a no-handler mesh, so the ray still reaches the
// plane behind it). The visible overlay draws with depthTest off + a high
// renderOrder instead of a tall z, so it floats over the standing dominoes
// without this generic tool needing to know how tall a domino is.
const BACKDROP_Z = 0.4;
const PICK_Z = 0.5;
const FILL_Z = 1;
const BORDER_Z = 1.01;
const HANDLE_Z = 1.5;
const CATCH_Z = 2;

// Render order for the depthTest-off overlay pieces (higher = later = on top).
const FILL_ORDER = 10;
const BORDER_ORDER = 11;
const HANDLE_ORDER = 12;

// Smallest gap (mm) a resize may leave between the dragged edge and its fixed
// opposite, so a rectangle can't invert. Sub-domino sizes are rejected by the
// type's setBounds anyway; this just keeps the geometry sane mid-drag.
const MIN_MM = 1;

// Huge transparent plane mounted only while dragging, so pointer move/up keep
// arriving even when the cursor leaves the small handle it grabbed — the same
// role CreateByRegionTool's full-footprint pick plane plays for a placement drag.
const CATCH_SIZE = 1_000_000;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Which mesh a hover cursor belongs to. "overlay" covers the selection fill and
 * all eight resize handles together — they mount and unmount as one group, with
 * the selection itself — while each selectable child's PickPlane owns its own.
 * See cursorOwnerRef for what this is for.
 */
type CursorOwner = { kind: "pick"; id: DDObjectId } | { kind: "overlay" };

/** The one owner shared by the selection overlay's fill and its handles. */
const OVERLAY_CURSOR: CursorOwner = { kind: "overlay" };

/** New footprint for a resize handle dragged by (dx,dy) mm, clamped to `root`. */
function resizeRect(
  orig: Bounds,
  id: ResizeHandleId,
  dx: number,
  dy: number,
  root: Bounds,
): Bounds {
  const rl = root.x, rr = root.x + root.width, rb = root.y, rt = root.y + root.height;
  let left = orig.x, right = orig.x + orig.width;
  let bottom = orig.y, top = orig.y + orig.height;

  // A handle drives at most one of {left,right} and one of {bottom,top}, so the
  // clamps below never reference an edge this same handle also moved.
  if (id.includes("w")) left = clamp(orig.x + dx, rl, right - MIN_MM);
  if (id.includes("e")) right = clamp(orig.x + orig.width + dx, left + MIN_MM, rr);
  if (id.includes("s")) bottom = clamp(orig.y + dy, rb, top - MIN_MM);
  if (id.includes("n")) top = clamp(orig.y + orig.height + dy, bottom + MIN_MM, rt);

  return { x: left, y: bottom, width: right - left, height: top - bottom };
}

/** New footprint for a whole-object move by (dx,dy) mm, kept inside `root`. */
function moveRect(
  orig: Bounds,
  dx: number,
  dy: number,
  root: Bounds,
): Bounds {
  const rr = root.x + root.width, rt = root.y + root.height;
  return {
    x: clamp(orig.x + dx, root.x, rr - orig.width),
    y: clamp(orig.y + dy, root.y, rt - orig.height),
    width: orig.width,
    height: orig.height,
  };
}

interface DragState {
  pointerStart: { x: number; y: number };
  original: Bounds;
  originalObject: DDObject;
  handle: ResizeHandleId | "move";
}

/**
 * Generic selection + direct-manipulation for the Select tool. Lives inside the
 * <Canvas>, and works for any DDObject the registry reports as selectable with a
 * footprint — it never references a concrete type. It draws a light-gray overlay
 * over the selected object's bounds, offers move (drag the body) and resize (drag
 * a corner/edge), and deletes on the Delete key.
 *
 * It mirrors CreateByRegionTool's conventions: build-plane-mm coordinates from
 * `event.point`, transparent-not-invisible pick meshes, useShallow on any
 * bounds-returning selector (getDDObjectBounds allocates fresh each call, which
 * loops useSyncExternalStore — React #185), and a left-button guard so right-drag
 * still pans. The two tools are mutually exclusive: this arms only for the Select
 * tool, CreateByRegionTool only for tools that declare an elementType.
 */
export default function SelectionTool() {
  const activeTool = useStore((s) => s.activeTool);
  const editing = useStore((s) => s.editingDDObjectId !== null);
  const selectDDObject = useStore((s) => s.selectDDObject);
  const enterDominoEditing = useStore((s) => s.enterDominoEditing);
  const rootBounds = useStore(
    useShallow((s) => getDDObjectBounds(s.ddObjects[s.rootId])),
  );
  const childIds = useStore(
    useShallow((s) => {
      const root = s.ddObjects[s.rootId];
      return "children" in root ? root.children : [];
    }),
  );
  // The store's own stable reference (not a computed object), so no useShallow.
  const selected = useStore((s) =>
    s.selectedDDObjectId ? s.ddObjects[s.selectedDDObjectId] ?? null : null,
  );

  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  // dragRef is the source of truth read by every handler (no stale closures);
  // `dragging` only exists to mount the catch plane and repaint.
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  // Unit-square edge geometry, scaled per selection — so a live resize doesn't
  // churn a new geometry every frame.
  const unitEdges = useMemo(() => new EdgesGeometry(new PlaneGeometry(1, 1)), []);
  useEffect(() => () => unitEdges.dispose(), [unitEdges]);

  const armed = activeTool === "select" && !editing && !!rootBounds;

  /**
   * Which mesh's hover the canvas cursor currently belongs to, or null when
   * nothing holds it.
   *
   * A hover cursor is normally cleared by the same mesh's own onPointerOut —
   * but a mesh deleted, deselected or disarmed out from under the pointer never
   * gets one: R3F derives pointerout by diffing raycast hits between pointer
   * events, and an object removed from the scene is never diffed against. (The
   * Delete key is the worst case: it fires from a keydown handler, so there is
   * no pointer event at all.) The cursor it set would then sit on the canvas
   * indefinitely — and because this is an inline style on the <canvas> itself,
   * it outranks the inherited `cursor: crosshair` from .canvasAreaPlacing, so a
   * stranded hand survives even a subsequent placement drag.
   *
   * The effect below re-checks instead. This token is what keeps that re-check
   * from clearing a cursor some *other*, still-hovered mesh has since set.
   */
  const cursorOwnerRef = useRef<CursorOwner | null>(null);

  const setCursor = (owner: CursorOwner | null, c: string) => {
    cursorOwnerRef.current = c === "" ? null : owner;
    gl.domElement.style.cursor = c;
  };

  const endDrag = (restore: boolean) => {
    const d = dragRef.current;
    if (restore && d) {
      // Put the whole object back — counts may have changed during the drag,
      // so restoring just the bounds would leave them inconsistent.
      useStore.getState().updateDDObject(d.originalObject.id, d.originalObject);
    } else if (d) {
      // A successful drop: the live updateDDObject calls during the drag
      // already left the final state in place, so this only records the
      // gesture as one undo step (store no-ops on a zero-distance drag).
      const s = useStore.getState();
      const current = s.ddObjects[d.originalObject.id];
      if (current) s.recordTransform(d.originalObject, current);
    }
    dragRef.current = null;
    setDragging(false);
    setCursor(null, "");
    invalidate();
  };

  // Delete removes the selection; Escape cancels a drag or, when idle, deselects.
  // Installed only while armed, like CreateByRegionTool's Escape handler.
  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (typing) return;

      const s = useStore.getState();
      if (e.key === "Escape") {
        if (dragRef.current) endDrag(true);
        else if (s.selectedDDObjectId) s.selectDDObject(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && s.selectedDDObjectId) {
        e.preventDefault();
        s.removeDDObject(s.selectedDDObjectId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  // Losing arm mid-drag (a dialog opened, the tool switched) must not strand it.
  useEffect(() => {
    if (!armed && dragRef.current) endDrag(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  // Release a hover cursor whose mesh has gone away — deleted, deselected, or
  // unmounted by the tool disarming. See cursorOwnerRef for why no pointerout
  // ever arrives to do it. Skipped mid-drag: the cursor belongs to the drag
  // then, and endDrag clears it.
  //
  // The three deps are exactly the reactive signals for the three ways a setter
  // can vanish — `armed` (tool switch, dialog opened, entering domino editing),
  // `selected` (the fill and handles exist only while something is selected),
  // and `childIds` (a delete strips the id from the root's children, which is
  // what unmounts that object's PickPlane). ddObjects is read imperatively
  // rather than subscribed: childIds is already the signal, so a second
  // subscription would only add re-renders.
  useEffect(() => {
    const owner = cursorOwnerRef.current;
    if (!owner || dragRef.current) return;
    const stillThere =
      armed &&
      (owner.kind === "overlay" ? !!selected : !!useStore.getState().ddObjects[owner.id]);
    if (!stillThere) setCursor(null, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, selected, childIds]);

  if (!armed) return null;
  const root = rootBounds!;

  const selectedBounds =
    selected && isDDObjectSelectable(selected)
      ? getDDObjectBounds(selected)
      : undefined;

  const beginDrag = (handle: ResizeHandleId | "move", e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !selected || !selectedBounds) return;
    e.stopPropagation();
    dragRef.current = {
      pointerStart: { x: e.point.x, y: e.point.y },
      original: selectedBounds,
      originalObject: selected,
      handle,
    };
    setDragging(true);
    setCursor(OVERLAY_CURSOR, handle === "move" ? "move" : cursorFor(handle));
  };

  const onCatchMove = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.point.x - d.pointerStart.x;
    const dy = e.point.y - d.pointerStart.y;
    const target =
      d.handle === "move"
        ? moveRect(d.original, dx, dy, root)
        : resizeRect(d.original, d.handle, dx, dy, root);

    const s = useStore.getState();
    const obj = s.ddObjects[d.originalObject.id];
    if (!obj) return;
    const patch = applyDDObjectBounds(obj, target);
    // undefined = target too small/invalid; skip the frame, keep last valid.
    if (patch) s.updateDDObject(obj.id, patch);
  };

  const cx = selectedBounds ? selectedBounds.x + selectedBounds.width / 2 : 0;
  const cy = selectedBounds ? selectedBounds.y + selectedBounds.height / 2 : 0;
  const handleSize = selectedBounds
    ? clamp(Math.min(selectedBounds.width, selectedBounds.height) * 0.08, 8, 25)
    : 0;

  return (
    <>
      {/* Click the plane, off any object, to deselect. Transparent (not
          invisible) so it still raycasts. Below the per-object pick planes. */}
      <mesh
        position={[root.x + root.width / 2, root.y + root.height / 2, BACKDROP_Z]}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          selectDDObject(null);
        }}
      >
        <planeGeometry args={[root.width, root.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* One pick plane per selectable child, to select it by clicking it. */}
      {childIds.map((id) => (
        <PickPlane
          key={id}
          ddObjectId={id}
          onSelect={selectDDObject}
          onEnterDominoEditing={enterDominoEditing}
          dragging={dragging}
          setCursor={setCursor}
        />
      ))}

      {selectedBounds && (
        <>
          {/* Light-gray fill = the selection highlight and the move hit area. */}
          <mesh
            position={[cx, cy, FILL_Z]}
            scale={[selectedBounds.width, selectedBounds.height, 1]}
            renderOrder={FILL_ORDER}
            onPointerDown={(e) => beginDrag("move", e)}
            onPointerOver={() => {
              if (!dragRef.current) setCursor(OVERLAY_CURSOR, "move");
            }}
            onPointerOut={() => {
              if (!dragRef.current) setCursor(null, "");
            }}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              color="#bcd6ff"
              transparent
              opacity={0.2}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>

          {/* Line border around the footprint. */}
          <lineSegments
            geometry={unitEdges}
            position={[cx, cy, BORDER_Z]}
            scale={[selectedBounds.width, selectedBounds.height, 1]}
            renderOrder={BORDER_ORDER}
          >
            <lineBasicMaterial color="#3246f9" transparent depthTest={false} />
          </lineSegments>

          {/* Corner + edge resize handles. */}
          {RESIZE_HANDLES.map((id) => {
            const [hx, hy] = handlePos(selectedBounds, id);
            return (
              <mesh
                key={id}
                position={[hx, hy, HANDLE_Z]}
                renderOrder={HANDLE_ORDER}
                onPointerDown={(e) => beginDrag(id, e)}
                onPointerOver={() => {
                  if (!dragRef.current) setCursor(OVERLAY_CURSOR, cursorFor(id));
                }}
                onPointerOut={() => {
                  if (!dragRef.current) setCursor(null, "");
                }}
              >
                <planeGeometry args={[handleSize, handleSize]} />
                <meshBasicMaterial color="#4283fb" depthTest={false} depthWrite={false} />
              </mesh>
            );
          })}
        </>
      )}

      {/* Mounted only mid-drag, huge, so move/up never fall through a gap. */}
      {dragging && (
        <mesh
          position={[root.x + root.width / 2, root.y + root.height / 2, CATCH_Z]}
          onPointerMove={onCatchMove}
          onPointerUp={() => endDrag(false)}
        >
          <planeGeometry args={[CATCH_SIZE, CATCH_SIZE]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}

/**
 * Transparent click target over one selectable child's footprint. Its own store
 * subscription keeps re-selection cheap and follows the object as it moves.
 */
function PickPlane({
  ddObjectId,
  onSelect,
  onEnterDominoEditing,
  dragging,
  setCursor,
}: {
  ddObjectId: DDObjectId;
  onSelect: (id: DDObjectId) => void;
  onEnterDominoEditing: (id: DDObjectId) => void;
  dragging: boolean;
  setCursor: (owner: CursorOwner | null, c: string) => void;
}) {
  const ddObject = useStore((s) => s.ddObjects[ddObjectId] ?? null);
  if (!ddObject || !isDDObjectSelectable(ddObject)) return null;
  const b = getDDObjectBounds(ddObject);
  if (!b) return null;

  return (
    <mesh
      position={[b.x + b.width / 2, b.y + b.height / 2, PICK_Z]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        onSelect(ddObjectId);
      }}
      onDoubleClick={(e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (isDominoEditable(ddObject)) onEnterDominoEditing(ddObjectId);
      }}
      onPointerOver={() => {
        if (!dragging) setCursor({ kind: "pick", id: ddObjectId }, "pointer");
      }}
      onPointerOut={() => {
        if (!dragging) setCursor(null, "");
      }}
    >
      <planeGeometry args={[b.width, b.height]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}