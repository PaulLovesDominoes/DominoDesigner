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
import { MIN_IMAGE_MM, imageOriginFor, type DominoImageMap } from "./object-model";

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
 *
 * ---- Entered only from the menu, and that is what makes it work ----
 *
 * This whole component mounts only while Resize and Move is on, which is reached
 * from the toolbar's image menu and from nowhere else. There is deliberately no
 * clicking the picture to *enter* the mode — though clicking away from it does
 * leave, which is a different thing and is safe for a reason worth spelling out.
 *
 * A canvas-wide plane is what makes two tools impossible to mount together:
 * whichever of two such planes sits nearer the camera swallows every press for
 * both. That is why the picture could once only be shown in a mode where
 * dominoes could not be edited — this tool kept a plane up at all times, waiting
 * for a click on the picture, and DominoEditor had one of its own.
 *
 * With no click-to-enter, this tool has nothing to listen for until the mode is
 * already on, so its planes are mounted only for as long as the mode lasts —
 * exactly when DominoEditor mounts none. The two simply take turns. Re-adding
 * click-to-enter would put a permanent plane back and undo the whole split.
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
const DISMISS_Z = 0.5;
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
  /**
   * The whole record when the drag began, which is what a finished drag is
   * recorded against and what Escape puts back. Holding the store's own
   * reference is a sound snapshot because nothing edits a record in place —
   * updateImageMap builds a new one every time.
   */
  originalImage: DominoImageMap;
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
  const imageTransformActive = useStore((s) => s.imageTransformActive);
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

  // One gate for the whole tool, where there used to be two. The inner one
  // existed because this was mounted before the picture had been selected, so
  // that a press could do the selecting; with no click-to-select there is
  // nothing to mount early for, and the border, the grips and the move target
  // all appear and disappear together.
  const armed = !!dominoEditingId && imageTransformActive && !!image && !!ddObject;

  /**
   * Whether this tool currently owns the canvas cursor.
   *
   * A hover cursor is normally cleared by the same mesh's own onPointerOut, but
   * a mesh that disappears out from under the pointer never gets one: R3F works
   * out pointerout by comparing what the ray hits between pointer events, and an
   * object no longer in the scene is never compared against. Leaving the mode
   * from the menu does exactly that, with no pointer event involved at all — so
   * without the effect below, a resize cursor would sit on the canvas
   * indefinitely.
   */
  const cursorHeldRef = useRef(false);

  const setCursor = (cursor: string) => {
    cursorHeldRef.current = cursor !== "";
    gl.domElement.style.cursor = cursor;
  };

  /**
   * Ends a drag. `restore` true puts the picture back where it started and
   * records nothing; false keeps where it was dropped and records that as one
   * undo entry.
   *
   * The same split SelectionTool makes, and for the same reason: every
   * pointermove has already written the new rectangle straight into the store,
   * because the user has to see the picture move as they drag it. So a drop has
   * nothing left to write and only has to say what happened, and an abandoned
   * drag has nothing to invert — there was never an entry pushed to invert.
   */
  const endDrag = (restore: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setCursor("");
    if (drag && dominoEditingId) {
      const store = useStore.getState();
      if (restore) {
        store.updateImageMap(dominoEditingId, drag.originalImage);
      } else {
        // Reads the record back rather than trusting a local copy, so what gets
        // recorded is exactly what is on screen. recordImageMapChange drops a
        // drag that finished where it began, so a click pushes nothing.
        const current = store.imageMaps[dominoEditingId];
        if (current) {
          store.recordImageMapChange(dominoEditingId, drag.originalImage, current);
        }
      }
    }
    invalidate();
  };

  // Escape is this mode's only key, and this is its only keyboard handler:
  // DominoEditor's Escape ladder is switched off while this mode owns the
  // canvas, so nothing is contested.
  //
  // Delete used to remove the picture from here and deliberately does not any
  // more. Deleting is a menu command and nothing else — a key that throws a
  // picture away is far too easy to hit while positioning one.
  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }

      if (e.key !== "Escape") return;
      // One press, one visible change — the same rule DominoEditor's ladder
      // follows. A drag in progress is abandoned and the picture goes back where
      // it was; otherwise the mode itself is left.
      if (dragRef.current) endDrag(true);
      else useStore.getState().setImageTransformActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, dominoEditingId]);

  // Losing the handles mid-drag — the mode left from the menu, the picture
  // deleted, the element deleted — must not leave a drag running against
  // nothing. It commits rather than reverting, matching SelectionTool: the
  // picture is already where the user dragged it, and snatching it back would
  // be the surprise.
  useEffect(() => {
    if (!armed && dragRef.current) endDrag(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  // Release a cursor whose mesh has gone. See cursorHeldRef for why no
  // pointerout arrives to do it. Skipped mid-drag: the cursor belongs to the
  // drag then, and endDrag clears it.
  useEffect(() => {
    if (!cursorHeldRef.current || dragRef.current) return;
    if (!armed) setCursor("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

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
    // Load-bearing, and the same call SelectionTool makes for the same reason.
    // R3F hands a pointer event to *every* mesh the ray passes through, nearest
    // to the camera first, unless a handler stops it. A grip sits above the
    // picture's move plane, so without this a press on a grip that overlaps the
    // picture ran this function twice — once for the grip, then again for the
    // move plane, which overwrote the drag with a move. The symptom was that
    // grips worked only where they hung off the edge of the picture.
    //
    // It also keeps a press off the dismiss plane below, which would otherwise
    // leave the mode on the very click that started a drag.
    e.stopPropagation();
    dragRef.current = {
      // The pointer arrives in world coordinates; everything else here is
      // anchor-relative, and a *difference* between two points is the same
      // either way, so the origin never has to be subtracted.
      pointerStart: { x: e.point.x, y: e.point.y },
      original: rect,
      originalImage: image,
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
      {/* Clicking away from the picture finishes the mode. Lowest of everything
          here in z, so the ray reaches it only after the grips and the move
          plane have declined the press — which they do by stopping propagation
          in beginDrag, so this never fires on a press that started a drag.

          A plane this size is normally the thing that makes two canvas tools
          impossible to mount together, since whichever sits nearer the camera
          swallows every press for both. It is safe here because DominoEditor
          mounts no plane of its own while either image sub-mode is on: the two
          tools take turns, and this one is mounted only for as long as Resize
          and Move is. */}
      <mesh
        position={[centreX, centreY, DISMISS_Z]}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          useStore.getState().setImageTransformActive(false);
        }}
      >
        <planeGeometry args={[CATCH_SIZE, CATCH_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* The picture's move target. Fully invisible rather than tinted — this
          sits over the picture, and any wash of colour here would bias exactly
          the judgement the user is placing it to make. Note `transparent` with
          zero opacity and NOT visible={false}, which would take the mesh out of
          ray casting altogether and leave nothing to grab.

          No visibility test: entering this mode shows the picture, so there is
          no such thing as being in here with a hidden one. */}
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

      {/* Border around the picture. */}
      <lineSegments
        geometry={unitEdges}
        position={[centreX, centreY, BORDER_Z]}
        scale={[rect.width, rect.height, 1]}
        renderOrder={BORDER_ORDER}
      >
        <lineBasicMaterial color={BORDER_COLOR} transparent depthTest={false} />
      </lineSegments>

      {/* Corner and edge grips. Corners hold the aspect ratio, edges do not —
          see resizeImageRect. */}
      {RESIZE_HANDLES.map((id) => {
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
          gap once the cursor has left the grip. Nothing competes with it for a
          press: DominoEditor's own canvas-wide plane is not mounted at all while
          this mode is on. */}
      {dragging && (
        <mesh
          position={[centreX, centreY, CATCH_Z]}
          onPointerMove={onCatchMove}
          onPointerUp={() => endDrag(false)}
          onPointerLeave={() => endDrag(false)}
        >
          <planeGeometry args={[CATCH_SIZE, CATCH_SIZE]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}