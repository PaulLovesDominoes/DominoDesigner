import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { EdgesGeometry, PlaneGeometry } from "three";

import { useStore } from "../store";
import {
  RESIZE_HANDLES,
  cursorFor,
  handlePos,
  isCornerHandle,
  type ResizeHandleId,
} from "../designer/resizeHandles";
import type { Bounds } from "../types";
import { MIN_IMAGE_MM, imageOriginFor } from "./object-model";

/**
 * Moving and resizing the picture laid over a field.
 *
 * Closely modelled on designer/SelectionTool.tsx — eight grips plus a body drag,
 * a huge catch plane mounted only while dragging, chrome drawn with depthTest
 * off so it floats over the standing dominoes, and the same cursor-ownership
 * discipline. Four things differ, each on purpose:
 *
 *  1. No tinted fill. SelectionTool's translucent blue rectangle doubles as its
 *     move target, but here it would lie over the picture and colour every
 *     judgement the user is in this mode to make. The move target is an
 *     invisible plane instead.
 *  2. Corners hold the picture's aspect ratio; edges do not. SelectionTool has
 *     no ratio lock at all.
 *  3. Nothing is clamped to the build plane. The picture is explicitly allowed
 *     to hang off the field and off the plane.
 *  4. No undo entry. The picture's placement is view state this version, like
 *     the Expand toggle and the camera — see CLAUDE.md.
 *
 * Everything here works in mm relative to the element's domino layout anchor,
 * the space the record stores, and the whole lot is wrapped in one <group> at
 * that anchor. So the rectangle dragged and the rectangle drawn by modeller.tsx
 * are literally the same numbers rather than two calculations that have to
 * agree.
 */

// Z layering for the chrome. Everything here draws with depthTest off and a
// render order instead of a tall z, so it floats over whatever the picture and
// the dominoes are doing; the z values only order these pieces against each
// other. The move plane sits lowest so the grips win a pointer landing on both.
const DESELECT_Z = 0.5;
const MOVE_Z = 1;
const BORDER_Z = 1.01;
const HANDLE_Z = 1.5;
const CATCH_Z = 2;

const MOVE_ORDER = 30;
const BORDER_ORDER = 31;
const HANDLE_ORDER = 32;

// Same role as SelectionTool's: mounted only while dragging, so pointer move and
// up keep arriving once the cursor leaves the small grip it took hold of.
const CATCH_SIZE = 1_000_000;

const BORDER_COLOR = "#3246f9";
const HANDLE_COLOR = "#4283fb";

interface DragState {
  pointerStart: { x: number; y: number };
  /** The picture's rectangle when the drag began, in anchor-relative mm. */
  original: Bounds;
  handle: ResizeHandleId | "move";
}

/** The picture moved by (dx, dy) mm. Deliberately unclamped. */
function moveImageRect(original: Bounds, dx: number, dy: number): Bounds {
  return { ...original, x: original.x + dx, y: original.y + dy };
}

/**
 * The picture resized by dragging `handle` (dx, dy) mm.
 *
 * An edge grip moves one edge and leaves the other three, so the picture
 * stretches. A corner grip holds the original proportions: the free rectangle
 * the cursor describes is conformed to that ratio by taking whichever of its two
 * dimensions asks for the larger picture, and then the corner diagonally
 * opposite the one being dragged is put back where it was — that corner is the
 * fixed point of the gesture, which is what makes the picture appear to grow out
 * of it rather than drift.
 */
function resizeImageRect(
  original: Bounds,
  handle: ResizeHandleId,
  dx: number,
  dy: number,
): Bounds {
  let left = original.x;
  let right = original.x + original.width;
  let bottom = original.y;
  let top = original.y + original.height;

  // A grip drives at most one of {left, right} and one of {bottom, top}, so
  // these four never fight over the same edge.
  if (handle.includes("w")) left = Math.min(original.x + dx, right - MIN_IMAGE_MM);
  if (handle.includes("e")) right = Math.max(original.x + original.width + dx, left + MIN_IMAGE_MM);
  if (handle.includes("s")) bottom = Math.min(original.y + dy, top - MIN_IMAGE_MM);
  if (handle.includes("n")) top = Math.max(original.y + original.height + dy, bottom + MIN_IMAGE_MM);

  if (!isCornerHandle(handle)) {
    return { x: left, y: bottom, width: right - left, height: top - bottom };
  }

  const ratio = original.width / original.height;
  const freeWidth = right - left;
  const freeHeight = top - bottom;
  // Taking the larger of the two candidate sizes means the picture always
  // reaches the cursor on at least one axis, which is what makes a corner drag
  // feel like it is following the pointer rather than lagging behind it.
  const width = Math.max(freeWidth, freeHeight * ratio);
  const height = width / ratio;

  // Whichever corner is not being dragged stays exactly where it was.
  const x = handle.includes("w") ? right - width : left;
  const y = handle.includes("s") ? top - height : bottom;
  return { x, y, width, height };
}

export default function ImageTransformTool() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const imageMapActive = useStore((s) => s.imageMapActive);
  const imageMapSelected = useStore((s) => s.imageMapSelected);
  // The store's own stable references, not computed objects, so no useShallow.
  const image = useStore((s) => (s.dominoEditingId ? s.imageMaps[s.dominoEditingId] : undefined));
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));

  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  // dragRef is what every handler reads, so none of them can go stale;
  // `dragging` exists only to mount the catch plane and repaint.
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  // Unit-square edge geometry, scaled per frame — so a live resize doesn't churn
  // a fresh geometry on every pointermove.
  const unitEdges = useMemo(() => new EdgesGeometry(new PlaneGeometry(1, 1)), []);
  useEffect(() => () => unitEdges.dispose(), [unitEdges]);

  const armed = !!dominoEditingId && imageMapActive && !!image && !!ddObject;
  const showing = armed && imageMapSelected;

  /**
   * Whether this tool currently owns the canvas cursor.
   *
   * A hover cursor is normally cleared by the same mesh's own onPointerOut, but
   * a mesh that disappears out from under the pointer never gets one: R3F works
   * out pointerout by comparing what the ray hits between pointer events, and an
   * object no longer in the scene is never compared against. Deselecting the
   * picture from the sidebar does exactly that, with no pointer event involved
   * at all — so without the effect below, a resize cursor would sit on the
   * canvas indefinitely.
   */
  const cursorHeldRef = useRef(false);

  const setCursor = (cursor: string) => {
    cursorHeldRef.current = cursor !== "";
    gl.domElement.style.cursor = cursor;
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    setCursor("");
    invalidate();
  };

  // Escape backs out, Delete removes the picture. This is the mode's only
  // keyboard handler: DominoEditor's four-rung Escape ladder and its
  // Delete/Backspace swatch keys are both switched off while image mapping is
  // on, since nothing they act on can be armed.
  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }

      if (e.key === "Escape") {
        if (dragRef.current) endDrag();
        else useStore.getState().setImageMapSelected(false);
        return;
      }

      // Delete removes the selected picture — the only way to get rid of one
      // without replacing it. No confirmation: removing what is selected is what
      // this key means everywhere, and loading another is one click. Note it is
      // not undoable, like everything else about a picture's placement.
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!dominoEditingId || !useStore.getState().imageMapSelected) return;
        // Backspace would otherwise navigate the page back — the same guard
        // DominoEditor applies to it.
        e.preventDefault();
        endDrag();
        useStore.getState().clearImageMap(dominoEditingId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, dominoEditingId]);

  // Losing the handles mid-drag — the picture deselected, image mode left, the
  // element deleted — must not leave a drag running against nothing.
  useEffect(() => {
    if (!showing && dragRef.current) endDrag();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing]);

  // Release a cursor whose mesh has gone. See cursorHeldRef for why no
  // pointerout arrives to do it. Skipped mid-drag: the cursor belongs to the
  // drag then, and endDrag clears it.
  useEffect(() => {
    if (!cursorHeldRef.current || dragRef.current) return;
    if (!showing) setCursor("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showing]);

  // Rendered whenever image mapping is on, not only while the picture is
  // selected: the two planes below are what make clicking the picture select it
  // and clicking away deselect it, and neither can happen if this is mounted
  // only once something already has. The border and grips are still conditional
  // on `showing`.
  if (!armed || !image || !ddObject) return null;
  const origin = imageOriginFor(ddObject);
  if (!origin) return null;

  const rect: Bounds = {
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
  };

  const beginDrag = (handle: ResizeHandleId | "move", e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    // Stops the deselect plane behind this one from seeing the same press.
    e.stopPropagation();
    // Pressing the picture selects it, so click-to-select and click-and-drag are
    // one gesture rather than two: the drag below starts either way, and a press
    // that never moves simply leaves it selected.
    if (!imageMapSelected) useStore.getState().setImageMapSelected(true);
    dragRef.current = {
      // The pointer arrives in world coordinates; everything else here is
      // anchor-relative, and a *difference* between two points is the same
      // either way, so the origin never has to be subtracted.
      pointerStart: { x: e.point.x, y: e.point.y },
      original: rect,
      handle,
    };
    setDragging(true);
    setCursor(handle === "move" ? "move" : cursorFor(handle));
  };

  const onCatchMove = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current;
    if (!d || !dominoEditingId) return;
    const dx = e.point.x - d.pointerStart.x;
    const dy = e.point.y - d.pointerStart.y;
    const target =
      d.handle === "move"
        ? moveImageRect(d.original, dx, dy)
        : resizeImageRect(d.original, d.handle, dx, dy);
    useStore.getState().updateImageMap(dominoEditingId, target);
  };

  const centreX = rect.x + rect.width / 2;
  const centreY = rect.y + rect.height / 2;
  // Proportional to the picture but bounded, so the grips stay grabbable on a
  // small one without swamping it on a large one. Same rule SelectionTool uses.
  const handleSize = Math.min(Math.max(Math.min(rect.width, rect.height) * 0.08, 8), 25);

  return (
    <group position={[origin.x, origin.y, 0]}>
      {/* Clicking away from the picture puts its handles away. Sits behind the
          picture's own plane, so a press landing on both goes to the picture;
          anything reaching here missed it. Deliberately far larger than the
          build plane, so a click out in the dark area beyond it deselects too.

          Left-button only — right-drag is OrbitControls' pan, and panning
          across the canvas has no business dropping the selection. */}
      <mesh
        position={[centreX, centreY, DESELECT_Z]}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (imageMapSelected) useStore.getState().setImageMapSelected(false);
        }}
      >
        <planeGeometry args={[CATCH_SIZE, CATCH_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* The picture's own target: selects it, and moves it. Fully invisible
          rather than tinted — this sits over the picture, and any wash of colour
          here would bias exactly the judgement the mode exists for. Note
          `transparent` with zero opacity and NOT visible={false}, which would
          take the mesh out of ray casting altogether and leave nothing to grab.

          Only while the picture is showing: an invisible plane over a hidden
          picture would select on what looks to the user like empty space. The
          sidebar's Select button still reaches a hidden picture. */}
      {image.visible && (
        <mesh
          position={[centreX, centreY, MOVE_Z]}
          scale={[rect.width, rect.height, 1]}
          renderOrder={MOVE_ORDER}
          onPointerDown={(e) => beginDrag("move", e)}
          onPointerOver={() => {
            if (!dragRef.current) setCursor("move");
          }}
          onPointerOut={() => {
            if (!dragRef.current) setCursor("");
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
        </mesh>
      )}

      {/* Border around the picture. */}
      {showing && (
      <lineSegments
        geometry={unitEdges}
        position={[centreX, centreY, BORDER_Z]}
        scale={[rect.width, rect.height, 1]}
        renderOrder={BORDER_ORDER}
      >
        <lineBasicMaterial color={BORDER_COLOR} transparent depthTest={false} />
      </lineSegments>
      )}

      {/* Corner and edge grips. Corners hold the aspect ratio, edges do not —
          see resizeImageRect. */}
      {showing && RESIZE_HANDLES.map((id) => {
        const [hx, hy] = handlePos(rect, id);
        return (
          <mesh
            key={id}
            position={[hx, hy, HANDLE_Z]}
            renderOrder={HANDLE_ORDER}
            onPointerDown={(e) => beginDrag(id, e)}
            onPointerOver={() => {
              if (!dragRef.current) setCursor(cursorFor(id));
            }}
            onPointerOut={() => {
              if (!dragRef.current) setCursor("");
            }}
          >
            <planeGeometry args={[handleSize, handleSize]} />
            <meshBasicMaterial color={HANDLE_COLOR} depthTest={false} depthWrite={false} />
          </mesh>
        );
      })}

      {/* Mounted only mid-drag, and huge, so move and up never fall through a
          gap once the cursor has left the grip. */}
      {dragging && (
        <mesh
          position={[centreX, centreY, CATCH_Z]}
          onPointerMove={onCatchMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <planeGeometry args={[CATCH_SIZE, CATCH_SIZE]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}