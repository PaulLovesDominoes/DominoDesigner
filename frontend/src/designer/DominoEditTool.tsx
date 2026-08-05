import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useShallow } from "zustand/shallow";
import { EdgesGeometry, PlaneGeometry, type Object3D, type Scene, type Raycaster } from "three";

import { useStore } from "../store";
import { getDDObjectBounds } from "../object-types/registry";
import type { DDObjectBounds, DDObjectId, DominoExpansion } from "../object-types/base";
import { DOMINO_SIZE } from "../dimensions";
import { useDominoDataStore } from "../dominoes/store";
import { resolveDominoExpansion } from "../dominoes/expansion";
import { HIDE_SWATCH_ID, UNASSIGNED_SWATCH_ID } from "../dominoes/swatches";
import {
  extent,
  nearestInDirection,
  type DominoData,
  type Direction,
} from "../dominoes/object-model";
import {
  useDominoSelectionStore,
  type DominoSelectionEntry,
} from "../dominoes/selectionStore";
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

// Clear space (mm) between the mode outline and the outermost dominoes it
// surrounds. Measured from the dominoes rather than the element's own bounds so
// the gap stays constant: a normalised field's boundary rectangle sits exactly
// on the outer domino edges (requiredSpan is precisely the dominoes' drawn
// span), which left the outline flush against them, while a handle-dragged one
// can sit up to a full pitch outside them.
const MODE_OUTLINE_MARGIN = 10;

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

/**
 * A domino's footprint on the build plane, parent-relative. Every hit test below
 * measures against this rather than DOMINO_SIZE directly, so it follows the
 * Expand toggle: a domino drawn oversized must be selectable at the size it is
 * drawn, or the rubber band visibly cuts through one without taking it.
 * `expansion` is per side, hence four terms rather than two half-extents.
 */
function footprint(data: DominoData, i: number, expansion: DominoExpansion) {
  const x = data.positions[3 * i];
  const y = data.positions[3 * i + 1];
  return {
    minX: x - DOMINO_SIZE.thickness / 2 - expansion.x0,
    maxX: x + DOMINO_SIZE.thickness / 2 + expansion.x1,
    minY: y - DOMINO_SIZE.width / 2 - expansion.y0,
    maxY: y + DOMINO_SIZE.width / 2 + expansion.y1,
  };
}

/**
 * Where the mode outline is drawn: MODE_OUTLINE_MARGIN outside every domino's
 * drawn footprint, in world coordinates. Falls back to the element's own bounds
 * for an element with no dominoes, which is the one case `extent` can't answer.
 *
 * This is `extent`'s first caller — the generic footprint primitive in
 * dominoes/object-model.ts, kept for exactly this. Using it here keeps the
 * outline type-agnostic, and is safe in a way substituting it for a type's
 * `bounds()` would not be: the outline is decorative, and nothing measures a
 * drag against it.
 *
 * Two details `extent` leaves to the caller. It reports the bounding box of
 * domino *centres*, so the half-extent and expansion padding are added here —
 * and padding a centres-box is only the same as unioning every domino's own
 * `footprint` because every domino in an element is drawn the same size
 * (DOMINO_SIZE is global, expansion is per element). That is the assumption
 * `footprint` already makes by ignoring `orientations`; if a type ever mixes
 * orientations, both need revisiting together.
 */
function modeOutlineRect(
  bounds: DDObjectBounds,
  data: DominoData | undefined,
  expansion: DominoExpansion,
): DDObjectBounds {
  const e = data && extent(data);
  if (!e) {
    return {
      x: bounds.x - MODE_OUTLINE_MARGIN,
      y: bounds.y - MODE_OUTLINE_MARGIN,
      width: bounds.width + 2 * MODE_OUTLINE_MARGIN,
      height: bounds.height + 2 * MODE_OUTLINE_MARGIN,
    };
  }
  // DominoData positions are parent-relative, so bounds.x/y (the element's
  // position) is what puts them back into world coordinates.
  const padX0 = DOMINO_SIZE.thickness / 2 + expansion.x0 + MODE_OUTLINE_MARGIN;
  const padX1 = DOMINO_SIZE.thickness / 2 + expansion.x1 + MODE_OUTLINE_MARGIN;
  const padY0 = DOMINO_SIZE.width / 2 + expansion.y0 + MODE_OUTLINE_MARGIN;
  const padY1 = DOMINO_SIZE.width / 2 + expansion.y1 + MODE_OUTLINE_MARGIN;
  return {
    x: bounds.x + e.x - padX0,
    y: bounds.y + e.y - padY0,
    width: e.width + padX0 + padX1,
    height: e.height + padY0 + padY1,
  };
}

/** Full-containment test: every domino whose own footprint fits inside `rect`. */
function enclosedIndices(data: DominoData, rect: Rect, expansion: DominoExpansion): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.count; i++) {
    const f = footprint(data, i, expansion);
    if (f.minX >= rect.minX && f.maxX <= rect.maxX && f.minY >= rect.minY && f.maxY <= rect.maxY) {
      result.push(i);
    }
  }
  return result;
}

/**
 * Intersection test: every domino whose footprint overlaps `rect` at all,
 * however slightly. This is what a rubber-band drag uses — a box the user can
 * see cutting across a row is expected to take that row.
 *
 * Deliberately not a replacement for enclosedIndices above: Shift+Arrow's rect
 * comes from rectFromIndices, whose edges land flush on the anchor/active
 * dominoes' own boundaries, so an intersection test there would let neighbours
 * on the far side of a tight pitch bleed in.
 */
function touchedIndices(data: DominoData, rect: Rect, expansion: DominoExpansion): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.count; i++) {
    const f = footprint(data, i, expansion);
    if (f.maxX >= rect.minX && f.minX <= rect.maxX && f.maxY >= rect.minY && f.minY <= rect.maxY) {
      result.push(i);
    }
  }
  return result;
}

/** The tight rectangle spanning two dominoes' own footprints. */
function rectFromIndices(
  data: DominoData,
  i1: number,
  i2: number,
  expansion: DominoExpansion,
): Rect {
  const a = footprint(data, i1, expansion);
  const b = footprint(data, i2, expansion);
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Whether two ascending index lists are identical. `touchedIndices` builds them
 * in order, so this is a plain elementwise compare — and it is what stops a
 * rubber-band drag from redrawing every domino at pointer-event rate when the
 * box moved but swept nothing new (the compare is integers only; the redraw it
 * skips rewrites a matrix, a colour and two attributes per domino).
 */
function sameIndices(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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
  expansion: DominoExpansion,
): Set<number> {
  const selected = new Set(baseSelection);
  for (const i of enclosedIndices(data, rectFromIndices(data, anchor, active, expansion), expansion))
    selected.add(i);
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
 * Applies whatever swatch is locked, if any, to the current selection. Called
 * after every gesture below that changes which dominoes are selected (but not
 * after clearing a selection — nothing to apply to then).
 *
 * A thin delegate: the real action lives in the store so the selection commands
 * that don't come through this file — select all, invert, the swatch menus —
 * apply the lock the same way. Kept as a local name only because the five
 * gesture call sites read better for it.
 */
function applyLockedColorIfAny() {
  useStore.getState().applyLockedSwatchIfAny();
}

interface GestureState {
  startWorld: { x: number; y: number };
  startIndex: number | undefined;
  ctrl: boolean;
  dragging: boolean;
  /**
   * The selection as it stood when the gesture began. A rubber-band drag now
   * previews live, replacing the stored selection on every frame, so Ctrl+drag's
   * union has to build on this snapshot rather than on the store — which after
   * the first frame holds this very drag's own preview. It is also what Escape
   * mid-drag puts back. Holding the reference is a sound snapshot because every
   * write path calls `replace` with a brand-new entry; nothing mutates one in
   * place.
   */
  before: DominoSelectionEntry | undefined;
  /** Touched set last pushed, so a frame that swept nothing new skips the redraw. */
  lastTouched: number[] | undefined;
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
  // The mode outline is measured off the dominoes, so unlike everything else in
  // this file it has to follow DominoData itself — a resize regenerates the
  // buffers without necessarily re-rendering this component otherwise. These
  // three plus the expansion inputs below are what modeOutlineRect reads.
  const dataVersion = useDominoDataStore((s) =>
    dominoEditingId ? s.versions[dominoEditingId] : undefined,
  );
  const dominoExpanded = useStore((s) => s.dominoExpanded);
  const editedDDObject = useStore((s) =>
    s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined,
  );

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

  // Memoized rather than computed inline: this component re-renders on every
  // pointermove of a rubber-band drag, and modeOutlineRect's extent() call is an
  // O(count) pass over the dominoes.
  const outlineRect = useMemo(
    () =>
      dominoEditingId && fieldBounds
        ? modeOutlineRect(
            fieldBounds,
            useDominoDataStore.getState().get(dominoEditingId),
            resolveDominoExpansion(dominoEditingId),
          )
        : null,
    // dataVersion/dominoExpanded/editedDDObject are deliberate deps despite not
    // appearing above: they are the reactive signals behind the two imperative
    // reads, same pattern as DominoColorPanel's memos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dominoEditingId, fieldBounds, dataVersion, dominoExpanded, editedDDObject],
  );

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
    const g = gestureRef.current;
    // A drag previews its selection live, so backing out has to put the
    // pre-gesture selection back — Escape mid-drag must leave no trace.
    if (g?.dragging && dominoEditingId) {
      const store = useDominoSelectionStore.getState();
      if (g.before) store.replace(dominoEditingId, g.before);
      else store.clear(dominoEditingId);
    }
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
      const selected = recomputeFromRect(
        data,
        entry.baseSelection,
        entry.anchor,
        nextActive,
        resolveDominoExpansion(dominoEditingId),
      );
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

      // The two special swatches' keys — the "DEL"/"Bksp" labels the color
      // panel shows on them name exactly these. Routed through applyDominoSwatch
      // so they inherit the same undo step, colour memory sync and
      // empty-selection no-op as clicking the swatch itself.
      if (e.key === "Delete" || e.key === "Backspace") {
        // Backspace would otherwise navigate the page back.
        e.preventDefault();
        useStore
          .getState()
          .applyDominoSwatch(e.key === "Delete" ? HIDE_SWATCH_ID : UNASSIGNED_SWATCH_ID);
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
      before: useDominoSelectionStore.getState().get(dominoEditingId),
      lastTouched: undefined,
    };
  };

  /**
   * The selection a rubber-band drag ending at `endWorld` produces — run on
   * every pointermove so the outlines preview live, and once more at pointerup.
   * It is therefore a pure function of the gesture and never of the stored
   * selection, which after the first frame holds this same drag's preview.
   *
   * Returns null when the box swept exactly the same dominoes as the previous
   * frame, so an unchanged drag costs one integer compare instead of a full
   * redraw. `force` skips that shortcut for the final resolve at pointerup.
   */
  const resolveDrag = (
    data: DominoData,
    g: GestureState,
    endWorld: { x: number; y: number },
    force: boolean,
  ): DominoSelectionEntry | null => {
    // Field-local coordinates — DominoData positions are parent-relative.
    const startLocal = { x: g.startWorld.x - fieldBounds.x, y: g.startWorld.y - fieldBounds.y };
    const endLocal = { x: endWorld.x - fieldBounds.x, y: endWorld.y - fieldBounds.y };
    const rect: Rect = {
      minX: Math.min(startLocal.x, endLocal.x),
      maxX: Math.max(startLocal.x, endLocal.x),
      minY: Math.min(startLocal.y, endLocal.y),
      maxY: Math.max(startLocal.y, endLocal.y),
    };
    const touched = touchedIndices(data, rect, resolveDominoExpansion(dominoEditingId));
    if (!force && g.lastTouched && sameIndices(touched, g.lastTouched)) return null;
    g.lastTouched = touched;

    const baseSelection = g.ctrl ? new Set(g.before?.selected ?? []) : new Set<number>();
    const selected = new Set(baseSelection);
    for (const i of touched) selected.add(i);

    // anchor/active track the drag's actual start/end points (not the
    // rectangle's normalized corners), so Shift+Arrow always extends from
    // wherever the gesture ended, whichever corner that geometrically was
    // — mirrors Excel's click-drag-then-shift-arrow behavior.
    let anchor = g.before?.anchor ?? 0;
    let active = g.before?.active ?? 0;
    if (touched.length > 0) {
      anchor = nearestToPoint(data, touched, startLocal.x, startLocal.y);
      active = nearestToPoint(data, touched, endLocal.x, endLocal.y);
    }
    return { selected, baseSelection, anchor, active };
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const g = gestureRef.current;
    if (!g) return;
    const dx = e.point.x - g.startWorld.x;
    const dy = e.point.y - g.startWorld.y;
    if (!g.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_MM) return;
    g.dragging = true;
    setDragCurrent({ x: e.point.x, y: e.point.y });

    // Preview which dominoes the box has swept so far. Deliberately no
    // applyLockedColorIfAny here: that would paint — and push an undo entry —
    // on every frame of the drag. A locked color is applied once, at pointerup.
    const data = useDominoDataStore.getState().get(dominoEditingId);
    if (!data) return;
    const entry = resolveDrag(data, g, { x: e.point.x, y: e.point.y }, false);
    if (entry) useDominoSelectionStore.getState().replace(dominoEditingId, entry);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;

    const data = useDominoDataStore.getState().get(dominoEditingId);
    const selectionStore = useDominoSelectionStore.getState();

    if (data) {
      if (g.dragging) {
        // Same resolve the live preview has been running; forced, so the final
        // state is committed even if this frame swept nothing new.
        const entry = resolveDrag(data, g, { x: e.point.x, y: e.point.y }, true);
        if (entry) selectionStore.replace(dominoEditingId, entry);
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
          own shape from inside the mode. Drawn a fixed margin off the dominoes
          rather than on the element's bounds, so it clears them by the same gap
          whether or not the Expand toggle is on — see modeOutlineRect. */}
      {outlineRect && (
        <lineSegments
          geometry={unitEdges}
          position={[
            outlineRect.x + outlineRect.width / 2,
            outlineRect.y + outlineRect.height / 2,
            OUTLINE_Z,
          ]}
          scale={[outlineRect.width, outlineRect.height, 1]}
        >
          <lineBasicMaterial color="#ffffff" transparent depthTest={false} />
        </lineSegments>
      )}

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