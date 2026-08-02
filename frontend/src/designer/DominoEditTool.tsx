import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useShallow } from "zustand/shallow";
import { EdgesGeometry, PlaneGeometry, type Object3D, type Scene, type Raycaster } from "three";

import { useStore } from "../store";
import { getDDObjectBounds } from "../object-types/registry";
import type { DDObjectBounds, DDObjectId } from "../object-types/base";
import { DOMINO_SIZE } from "../dimensions";
import { useDominoDataStore } from "../dominoes/store";
import { nearestInDirection, type DominoData, type Direction } from "../dominoes/object-model";
import { useDominoSelectionStore } from "../dominoes/selectionStore";
import { makeDominoColorClipboardHandlers } from "../dominoes/clipboardHandlers";
import { useCutCopyHandler, usePasteHandler } from "../clipboard/useClipboardHandlers";

// Z layering, lowest first — same convention as SelectionTool.tsx. The catch
// plane sits at the same height as other pick planes ("just above the build
// plane").
const CATCH_Z = 0.5;
const OUTLINE_Z = 1;
const DRAG_FILL_Z = 1.5;
const DRAG_BORDER_Z = 1.51;
const DRAG_ORDER = 20;
const DRAG_BORDER_ORDER = 21;

// Movement past this (mm) turns a press into a rubber-band drag rather than a
// click. Small relative to a domino's pitch (tens of mm), so it doesn't feel
// like a dead zone.
const DRAG_THRESHOLD_MM = 2;

interface Rect {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Full-containment test: every visible domino whose own footprint fits inside `rect`. */
function enclosedIndices(data: DominoData, rect: Rect): number[] {
  const hx = DOMINO_SIZE.thickness / 2;
  const hy = DOMINO_SIZE.width / 2;
  const result: number[] = [];
  for (let i = 0; i < data.count; i++) {
    if (data.hidden[i]) continue;
    const x = data.positions[3 * i];
    const y = data.positions[3 * i + 1];
    if (x - hx >= rect.minX && x + hx <= rect.maxX && y - hy >= rect.minY && y + hy <= rect.maxY) {
      result.push(i);
    }
  }
  return result;
}

/** The tight rectangle spanning two dominoes' own footprints (each ± its half-extent). */
function rectFromIndices(data: DominoData, i1: number, i2: number): Rect {
  const hx = DOMINO_SIZE.thickness / 2;
  const hy = DOMINO_SIZE.width / 2;
  const x1 = data.positions[3 * i1];
  const y1 = data.positions[3 * i1 + 1];
  const x2 = data.positions[3 * i2];
  const y2 = data.positions[3 * i2 + 1];
  return {
    minX: Math.min(x1, x2) - hx,
    maxX: Math.max(x1, x2) + hx,
    minY: Math.min(y1, y2) - hy,
    maxY: Math.max(y1, y2) + hy,
  };
}

/** The index among `candidates` nearest physical point (cx, cy). */
function nearestToPoint(data: DominoData, candidates: number[], cx: number, cy: number): number {
  let best = candidates[0];
  let bestDist = Infinity;
  for (const i of candidates) {
    const dx = data.positions[3 * i] - cx;
    const dy = data.positions[3 * i + 1] - cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/**
 * Shift+Arrow's live selection: everything preserved from before the
 * Shift+Arrow sequence began, unioned with the rectangle spanning anchor/active
 * — recomputed fresh on every press, never accumulated, so the rectangle can
 * shrink back down as freely as it grows.
 */
function recomputeFromRect(
  data: DominoData,
  baseSelection: Set<number>,
  anchor: number,
  active: number,
): Set<number> {
  const selected = new Set(baseSelection);
  for (const i of enclosedIndices(data, rectFromIndices(data, anchor, active))) selected.add(i);
  return selected;
}

/**
 * Finds the field's domino InstancedMesh by its userData tag (set in
 * dominoes/modeller.tsx). A scene traversal rather than a ref registry — this
 * only runs on discrete pointer gestures (down/up), not per frame, so the cost
 * is negligible for a scene this size.
 */
function findDominoMesh(scene: Scene, dominoEditingId: DDObjectId): Object3D | undefined {
  let found: Object3D | undefined;
  scene.traverse((obj) => {
    if (!found && (obj.userData as { ddObjectId?: DDObjectId }).ddObjectId === dominoEditingId) {
      found = obj;
    }
  });
  return found;
}

/**
 * Raycasts directly against the field's domino InstancedMesh, bypassing R3F's
 * synthetic pointer-event system (e.intersections) entirely. That system only
 * considers objects that have their own pointer-event JSX props registered —
 * and the domino mesh deliberately has none, so DDObject-level pick planes
 * underneath it (SelectionTool's PickPlane) keep receiving clicks unblocked
 * (see dominoes/modeller.tsx and CLAUDE.md's Selection section). `raycaster`
 * is the same THREE.Raycaster R3F itself just used to resolve this pointer
 * event, already pointed along the current ray.
 */
function hitDominoIndex(
  scene: Scene,
  raycaster: Raycaster,
  dominoEditingId: DDObjectId,
): number | undefined {
  const mesh = findDominoMesh(scene, dominoEditingId);
  if (!mesh) return undefined;
  const hits = raycaster.intersectObject(mesh, false);
  return hits.length > 0 ? hits[0].instanceId : undefined;
}

/**
 * Recolors the current selection to whatever's locked, if anything. Called
 * after every gesture that changes which dominoes are selected (but not
 * after clearing a selection — nothing to color then).
 */
function applyLockedColorIfAny() {
  const lockedId = useStore.getState().dominoColorLockedId;
  if (lockedId) useStore.getState().applyColorToSelectedDominoes(lockedId);
}

interface GestureState {
  startWorld: { x: number; y: number };
  startIndex: number | undefined;
  ctrl: boolean;
  dragging: boolean;
}

const DIRECTION_KEYS: Record<string, Direction> = {
  ArrowRight: "+x",
  ArrowLeft: "-x",
  ArrowUp: "+y",
  ArrowDown: "-y",
};

/**
 * Domino editing mode's canvas tool: entry is handled elsewhere (SelectionTool's
 * PickPlane double-click, DDObjectsPanel's row double-click); this owns
 * everything once inside the mode — the white no-fill mode-outline, per-domino
 * click/Ctrl+click/drag/Ctrl+drag selection, and arrow-key navigation. Mounted
 * unconditionally alongside CreateByRegionTool/SelectionTool; self-arms via
 * early return, like both of those.
 *
 * Selection is not undoable and has no snapshot/rollback — this pass only
 * selects dominoes, it never edits them, so there's nothing to commit or
 * revert; the store write pattern deliberately mirrors that (every gesture
 * calls replace()/clear() directly, no staging).
 */
export default function DominoEditTool() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  // useShallow: getDDObjectBounds allocates a fresh object per call (see
  // CLAUDE.md's React #185 note — SelectionTool.tsx and CameraRig.tsx hit the
  // same hazard for the same reason). undefined here also covers a dangling
  // dominoEditingId (the DDObject no longer exists), same as SelectionTool's
  // equivalent guard.
  const fieldBounds = useStore(
    useShallow((s) => {
      const field = s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined;
      return field ? getDDObjectBounds(field) : undefined;
    }),
  );
  const rootBounds = useStore(useShallow((s) => getDDObjectBounds(s.ddObjects[s.rootId])));

  const invalidate = useThree((s) => s.invalidate);
  const scene = useThree((s) => s.scene);
  const raycaster = useThree((s) => s.raycaster);

  const gestureRef = useRef<GestureState | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  // Auto-clears the shortcut buffer after a pause in typing — reset on every
  // keystroke, cleared (and the timer with it) whenever the buffer resolves
  // or gets abandoned some other way (Escape, Space, a new pointer gesture).
  const shortcutTimerRef = useRef<number | undefined>(undefined);

  // Unit-square edge geometry shared by the mode outline and the drag
  // rectangle border, scaled per-use — mirrors SelectionTool.tsx's unitEdges.
  const unitEdges = useMemo(() => new EdgesGeometry(new PlaneGeometry(1, 1)), []);
  useEffect(() => () => unitEdges.dispose(), [unitEdges]);

  // ── Clipboard: this component is the active cut/copy/paste context while the
  // mode is on. The Ctrl+C/X/V keys themselves are handled once, app-wide, in
  // DesignerScreen — registering here is the whole of this tool's involvement.
  const selectionVersion = useDominoSelectionStore((s) =>
    dominoEditingId ? s.versions[dominoEditingId] : undefined,
  );
  const clipboardHandlers = useMemo(
    () => (dominoEditingId ? makeDominoColorClipboardHandlers() : null),
    // selectionVersion is a deliberate dependency rather than a lint
    // appeasement: re-registering on it is what makes the handlers' canCopy/
    // canCut/canPaste reactive for any UI binding a button to them (see
    // useClipboardCapabilities). The handlers read live state either way.
    [dominoEditingId, selectionVersion],
  );
  useCutCopyHandler(clipboardHandlers?.cutCopy ?? null);
  usePasteHandler(clipboardHandlers?.paste ?? null);

  const cancelDrag = () => {
    gestureRef.current = null;
    setDragCurrent(null);
    invalidate();
  };

  // Arrow-key navigation + Escape. Installed only while in the mode; every
  // handler reads fresh state imperatively (getState()), so dominoEditingId is
  // the only thing that needs to be a dependency.
  useEffect(() => {
    if (!dominoEditingId) return;

    const runPlainArrow = (direction: Direction) => {
      const data = useDominoDataStore.getState().get(dominoEditingId);
      const entry = useDominoSelectionStore.getState().get(dominoEditingId);
      if (!data || !entry || entry.selected.size === 0) return;

      const axis = direction === "+x" || direction === "-x" ? 0 : 1;
      const sign = direction === "+x" || direction === "+y" ? 1 : -1;
      const EPS = 1e-6;

      let refIndex: number | undefined;
      let bestPrimary = -Infinity;
      let bestY = -Infinity;
      let bestX = Infinity;
      for (const i of entry.selected) {
        const x = data.positions[3 * i];
        const y = data.positions[3 * i + 1];
        const primary = (axis === 0 ? x : y) * sign;
        const better =
          primary > bestPrimary + EPS ||
          (Math.abs(primary - bestPrimary) <= EPS &&
            (y > bestY + EPS || (Math.abs(y - bestY) <= EPS && x < bestX - EPS)));
        if (better) {
          refIndex = i;
          bestPrimary = primary;
          bestY = y;
          bestX = x;
        }
      }
      if (refIndex === undefined) return;

      const target = nearestInDirection(data, refIndex, direction);
      if (target === undefined) return; // already at the edge

      useDominoSelectionStore.getState().replace(dominoEditingId, {
        selected: new Set([target]),
        baseSelection: new Set(),
        anchor: target,
        active: target,
      });
      applyLockedColorIfAny();
    };

    const runShiftArrow = (direction: Direction) => {
      const data = useDominoDataStore.getState().get(dominoEditingId);
      const entry = useDominoSelectionStore.getState().get(dominoEditingId);
      if (!data || !entry) return;

      const nextActive = nearestInDirection(data, entry.active, direction) ?? entry.active;
      const selected = recomputeFromRect(data, entry.baseSelection, entry.anchor, nextActive);
      useDominoSelectionStore.getState().replace(dominoEditingId, {
        selected,
        baseSelection: entry.baseSelection,
        anchor: entry.anchor,
        active: nextActive,
      });
      applyLockedColorIfAny();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      // Ctrl/Cmd+key is a keyboard-shortcut namespace (undo/redo, etc.), not
      // typing — let it fall through untouched, or Ctrl+Z would get read as
      // shortcut-typing "Z" instead of reaching DesignerScreen's undo handler.
      if (e.ctrlKey || e.metaKey) return;

      if (e.key === "Escape") {
        // Cancels a drag if one is in flight; otherwise clears the domino
        // selection, the color lock, and any in-progress shortcut buffer all
        // at once — Escape never exits the mode itself; only ModeHintBar's
        // Done/Cancel can.
        if (gestureRef.current?.dragging) {
          cancelDrag();
          return;
        }
        const entry = useDominoSelectionStore.getState().get(dominoEditingId);
        if (entry && entry.selected.size > 0) useDominoSelectionStore.getState().clear(dominoEditingId);
        const st = useStore.getState();
        if (st.dominoColorLockedId) st.toggleDominoColorLock(st.dominoColorLockedId);
        if (st.dominoColorShortcut) st.setDominoColorShortcut("");
        window.clearTimeout(shortcutTimerRef.current);
        return;
      }

      const direction = DIRECTION_KEYS[e.key];
      if (direction) {
        e.preventDefault();
        if (e.shiftKey) runShiftArrow(direction);
        else runPlainArrow(direction);
        return;
      }

      if (e.key === " ") {
        // Applies the *exact* match for the current buffer, if one exists —
        // disambiguates e.g. "B" from "B1"/"B2" when both are valid prefixes.
        const st = useStore.getState();
        if (st.dominoColorShortcut) {
          const exact = st.inventoryEntries.find(
            (en) => en.active && en.shortcut.toUpperCase() === st.dominoColorShortcut,
          );
          if (exact) st.applyColorToSelectedDominoes(exact.id);
          st.setDominoColorShortcut("");
          window.clearTimeout(shortcutTimerRef.current);
        }
        e.preventDefault();
        return;
      }

      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        const st = useStore.getState();
        const matchesFor = (buffer: string) =>
          st.inventoryEntries.filter((en) => en.active && en.shortcut.toUpperCase().startsWith(buffer));

        let next = (st.dominoColorShortcut + e.key).toUpperCase();
        let matches = matchesFor(next);
        if (matches.length === 0) {
          // No shortcut extends the old buffer with this key — start over
          // from just the new character rather than getting stuck.
          next = e.key.toUpperCase();
          matches = matchesFor(next);
        }

        st.setDominoColorShortcut(next);
        window.clearTimeout(shortcutTimerRef.current);
        shortcutTimerRef.current = window.setTimeout(
          () => useStore.getState().setDominoColorShortcut(""),
          1200,
        );

        if (matches.length === 1) {
          st.applyColorToSelectedDominoes(matches[0].id);
          st.setDominoColorShortcut("");
          window.clearTimeout(shortcutTimerRef.current);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(shortcutTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dominoEditingId]);

  if (!dominoEditingId || !fieldBounds || !rootBounds) return null;

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // A new pointer gesture abandons any in-progress shortcut typing.
    if (useStore.getState().dominoColorShortcut) useStore.getState().setDominoColorShortcut("");
    window.clearTimeout(shortcutTimerRef.current);
    gestureRef.current = {
      startWorld: { x: e.point.x, y: e.point.y },
      startIndex: hitDominoIndex(scene, raycaster, dominoEditingId),
      ctrl: e.ctrlKey || e.metaKey,
      dragging: false,
    };
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.point.x - g.startWorld.x;
    const dy = e.point.y - g.startWorld.y;
    if (!g.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_MM) return;
    g.dragging = true;
    setDragCurrent({ x: e.point.x, y: e.point.y });
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;

    const data = useDominoDataStore.getState().get(dominoEditingId);
    const selectionStore = useDominoSelectionStore.getState();

    if (data) {
      if (g.dragging) {
        // Rubber-band select: convert to field-local coordinates (DominoData
        // positions are parent-relative) and take everything fully enclosed.
        const startLocal = { x: g.startWorld.x - fieldBounds.x, y: g.startWorld.y - fieldBounds.y };
        const endLocal = { x: e.point.x - fieldBounds.x, y: e.point.y - fieldBounds.y };
        const rect: Rect = {
          minX: Math.min(startLocal.x, endLocal.x),
          maxX: Math.max(startLocal.x, endLocal.x),
          minY: Math.min(startLocal.y, endLocal.y),
          maxY: Math.max(startLocal.y, endLocal.y),
        };
        const enclosed = enclosedIndices(data, rect);
        const prevEntry = selectionStore.get(dominoEditingId);
        const baseSelection = g.ctrl ? new Set(prevEntry?.selected ?? []) : new Set<number>();
        const selected = new Set(baseSelection);
        for (const i of enclosed) selected.add(i);

        // anchor/active track the drag's actual start/end points (not the
        // rectangle's normalized corners), so Shift+Arrow always extends from
        // wherever the gesture ended, whichever corner that geometrically was
        // — mirrors Excel's click-drag-then-shift-arrow behavior.
        let anchor = prevEntry?.anchor ?? 0;
        let active = prevEntry?.active ?? 0;
        if (enclosed.length > 0) {
          anchor = nearestToPoint(data, enclosed, startLocal.x, startLocal.y);
          active = nearestToPoint(data, enclosed, endLocal.x, endLocal.y);
        }
        selectionStore.replace(dominoEditingId, { selected, baseSelection, anchor, active });
        applyLockedColorIfAny();
      } else if (g.startIndex === undefined) {
        // Click on empty space.
        if (!g.ctrl) selectionStore.clear(dominoEditingId);
      } else if (g.ctrl) {
        // Toggle in/out of the current selection. Anchor/active only reseed on
        // toggle-on — pointing them at a domino that just got deselected would
        // be meaningless for a future Shift+Arrow.
        const prevEntry = selectionStore.get(dominoEditingId);
        const selected = new Set(prevEntry?.selected ?? []);
        const wasSelected = selected.has(g.startIndex);
        if (wasSelected) selected.delete(g.startIndex);
        else selected.add(g.startIndex);
        const anchor = wasSelected ? prevEntry!.anchor : g.startIndex;
        const active = wasSelected ? prevEntry!.active : g.startIndex;
        selectionStore.replace(dominoEditingId, {
          selected,
          baseSelection: new Set(selected),
          anchor,
          active,
        });
        applyLockedColorIfAny();
      } else {
        // Plain click: replace the whole selection with just this domino.
        selectionStore.replace(dominoEditingId, {
          selected: new Set([g.startIndex]),
          baseSelection: new Set(),
          anchor: g.startIndex,
          active: g.startIndex,
        });
        applyLockedColorIfAny();
      }
    }

    setDragCurrent(null);
    invalidate();
  };

  const dragStart = gestureRef.current?.startWorld;
  const dragRect: DDObjectBounds | null =
    dragCurrent && dragStart
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragStart.x - dragCurrent.x),
          height: Math.abs(dragStart.y - dragCurrent.y),
        }
      : null;

  return (
    <>
      {/* White, no-fill context indicator — this DDObject's dominoes are being
          edited. No resize handles: nothing in this pass changes the field's
          own shape from inside the mode. */}
      <lineSegments
        geometry={unitEdges}
        position={[
          fieldBounds.x + fieldBounds.width / 2,
          fieldBounds.y + fieldBounds.height / 2,
          OUTLINE_Z,
        ]}
        scale={[fieldBounds.width, fieldBounds.height, 1]}
      >
        <lineBasicMaterial color="#ffffff" transparent depthTest={false} />
      </lineSegments>

      {/* Catches gestures across the whole build plane (not just the field's
          own footprint), so a click anywhere empty still clears the selection.
          Transparent, not invisible, so it still raycasts. */}
      <mesh
        position={[
          rootBounds.x + rootBounds.width / 2,
          rootBounds.y + rootBounds.height / 2,
          CATCH_Z,
        ]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <planeGeometry args={[rootBounds.width, rootBounds.height]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {dragRect && dragRect.width > 0 && dragRect.height > 0 && (
        <>
          <mesh
            position={[dragRect.x + dragRect.width / 2, dragRect.y + dragRect.height / 2, DRAG_FILL_Z]}
            renderOrder={DRAG_ORDER}
          >
            <planeGeometry args={[dragRect.width, dragRect.height]} />
            <meshBasicMaterial color="#2b2f36" transparent opacity={0.35} depthTest={false} depthWrite={false} />
          </mesh>
          <lineSegments
            geometry={unitEdges}
            position={[dragRect.x + dragRect.width / 2, dragRect.y + dragRect.height / 2, DRAG_BORDER_Z]}
            scale={[dragRect.width, dragRect.height, 1]}
            renderOrder={DRAG_BORDER_ORDER}
          >
            <lineBasicMaterial color="#000000" transparent depthTest={false} />
          </lineSegments>
        </>
      )}
    </>
  );
}