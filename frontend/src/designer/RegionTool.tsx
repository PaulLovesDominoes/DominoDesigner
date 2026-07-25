import { useEffect, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useShallow } from "zustand/shallow";

import { useStore } from "../store";
import { getDDObjectBounds, getDDObjectCreateFromRegion } from "../object-types/registry";
import { TOOLS } from "./toolConfig";

// Just above the build plane, and the preview just above that, so neither
// z-fights the surface it sits on.
const PICK_Z = 0.5;
const PREVIEW_Z = 1;

/** A point on the build plane, in millimetres from its lower-left corner. */
interface Point {
  x: number;
  y: number;
}

/** Lower-left corner plus extent, normalised for drag direction. */
function rectOf(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/**
 * Drag-to-place for DDObject types that declare `createFromRegion`. Generic on
 * purpose: it knows nothing about the root's concrete type or the type it is
 * placing, only the registry — the type-specific mapping from a drawn
 * rectangle to a creation patch lives with the type, in `createFromRegion`.
 *
 * Lives inside the <Canvas> because the region has to be read in build-plane
 * millimetres, and a raycast against a plane gives exactly that —
 * `event.point`'s world X/Y are build-plane coordinates, since the plane's
 * origin is the world origin.
 *
 * Drag state is deliberately local: only the finished rectangle ever reaches
 * the store.
 */
export default function RegionTool() {
  const activeTool = useStore((s) => s.activeTool);
  const editing = useStore((s) => s.editingDDObjectId !== null);
  const setTool = useStore((s) => s.setTool);
  const createElement = useStore((s) => s.createElement);
  // Shallow-compared for the same reason CameraRig's identical selector is:
  // getDDObjectBounds allocates a fresh object every call, so a bare selector
  // never returns a referentially stable snapshot and useSyncExternalStore
  // forces a render loop — Maximum update depth exceeded (React #185).
  const rootBounds = useStore(
    useShallow((s) => getDDObjectBounds(s.ddObjects[s.rootId])),
  );
  const invalidate = useThree((s) => s.invalidate);

  const elementType = TOOLS.find((t) => t.id === activeTool)?.elementType;

  // Where the drag began; null means no drag in flight. A ref because
  // onPointerUp must see the value written by onPointerDown in the same gesture,
  // and because Escape clears it synchronously.
  const startRef = useRef<Point | null>(null);
  const [current, setCurrent] = useState<Point | null>(null);

  // The dialog is modeless and the canvas stays interactive above its scrim, so
  // without the `!editing` guard a user could start a second drag behind the
  // open dialog — and the dialog's own Escape handler would fight this one.
  // A root whose type declares no bounds() leaves the tool unable to size or
  // clamp a picking plane, so it stays disarmed too; CameraRig already warns
  // about that condition, so this doesn't need to warn again.
  const armed = !!elementType && !editing && !!rootBounds;

  const cancelDrag = () => {
    startRef.current = null;
    setCurrent(null);
    invalidate();
  };

  useEffect(() => {
    if (!armed) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Mid-drag, Escape abandons just the drag and stays in placement mode —
      // clearing the ref is also what makes the pending pointer-up a no-op.
      // Otherwise it leaves placement mode entirely.
      if (startRef.current) cancelDrag();
      else setTool("select");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [armed, setTool]);

  // Leaving placement mode with a drag half-finished must not strand it.
  useEffect(() => {
    if (!armed && startRef.current) cancelDrag();
  }, [armed]);

  if (!armed) return null;

  // Non-null once `armed` is true (armed requires !!rootBounds).
  const bounds = rootBounds!;

  const at = (e: ThreeEvent<PointerEvent>): Point => ({
    x: clamp(e.point.x, bounds.x, bounds.x + bounds.width),
    y: clamp(e.point.y, bounds.y, bounds.y + bounds.height),
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return; // left button only; right-drag still pans
    e.stopPropagation();
    startRef.current = at(e);
    setCurrent(at(e));
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!startRef.current) return;
    setCurrent(at(e));
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const start = startRef.current;
    // No drag in flight means this release follows an Escape — ignore it.
    if (!start) return;

    const rect = rectOf(start, at(e));
    startRef.current = null;
    setCurrent(null);

    const patch = getDDObjectCreateFromRegion(elementType, rect);
    // A region the type considers too small/invalid is discarded like a
    // cancelled drag: nothing is created and placement mode stays active.
    if (!patch) {
      invalidate();
      return;
    }

    createElement(elementType, patch);
  };

  const preview = startRef.current && current
    ? rectOf(startRef.current, current)
    : null;

  return (
    <>
      {/* Catches the drag across the root's footprint. Transparent rather than
          `visible={false}`, which would opt it out of raycasting entirely. */}
      <mesh
        position={[
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
          PICK_Z,
        ]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <planeGeometry args={[bounds.width, bounds.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {preview && preview.width > 0 && preview.height > 0 && (
        <mesh
          position={[
            preview.x + preview.width / 2,
            preview.y + preview.height / 2,
            PREVIEW_Z,
          ]}
        >
          <planeGeometry args={[preview.width, preview.height]} />
          <meshBasicMaterial
            color="#4c8dff"
            transparent
            opacity={0.25}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
