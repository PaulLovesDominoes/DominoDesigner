import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useShallow } from "zustand/shallow";
import { EdgesGeometry, PlaneGeometry, type Object3D, type Scene, type Raycaster } from "three";

import { useStore } from "../store";
import { getDDObjectBounds, getSnapShapePoint } from "../object-types/registry";
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
import { getShapeSelect } from "../shape-select/registry";
import { indicesInShape, selectionFrom } from "../shape-select/dispatcher";
import {
  NO_SNAP,
  type SelectionGestureMode,
  type ShapeGestureSequence,
  type ShapeSelectEvent,
  type SnapShapePoint,
} from "../shape-select/base";
import {
  PREVIEW_BORDER_ORDER,
  PREVIEW_BORDER_Z,
  PREVIEW_FILL_Z,
  PREVIEW_ORDER,
  previewStyleFor,
} from "../shape-select/preview";

// Z layering, lowest first — same convention as SelectionTool.tsx. The catch
// plane sits at the same height as other pick planes ("just above the build
// plane"). The drag preview's own layer lives in shape-select/preview.ts, since
// the rectangle band below and every shape variant have to agree on it.
const CATCH_Z = 0.5;
const OUTLINE_Z = 1;

// The frame drawn round the DDObject whose dominoes are being edited. Original white,
// then changed to grey (to not conflict with the region selection color), but now
// changed back to white because "grey" basically disappeared.
//
// Deliberately it should not be any other color (other than white, black or gray)
// so as to stay as neutral as possible
// in terms of the user's artistic intentions for the colors they are creating in the 
// domoino element.
//
const MODE_OUTLINE_COLOR = "#FFFFFF";

// The catch plane's size — far past the build plane, always, so a selection
// gesture can be *started* anywhere as well as dragged anywhere. Ending
// off-plane matters because a drag that loses pointermove/pointerup is stranded
// half-finished; starting off-plane matters most for shape select, where the
// centre of a large circle whose arc just clips the field naturally falls well
// outside it. Same size as SelectionTool.tsx's mid-drag catch plane.
//
// Two consequences, both intended. A click far off the build plane now clears
// the selection, exactly as an empty click on it does — previously such a click
// fell through to DesignerCanvas's onPointerMissed, which only acts for the
// Select tool and so did nothing at all inside this mode. And onPointerMissed is
// now unreachable while the mode is on, which for the same reason changes
// nothing.
//
// Safe only because this plane exists solely inside domino editing mode
// (see the early return below), where SelectionTool and CreateByRegionTool are
// both disarmed by the activeTool === "editDominoes" check. OrbitControls is
// unaffected either way: it listens on gl.domElement at the DOM level, so an R3F
// mesh handler's stopPropagation never reaches it.
const CATCH_SIZE = 1_000_000;

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
 * comes from rectFromIndices, whose edges land flush on the two corner
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

/**
 * Shift+Arrow's live selection: everything preserved from before the
 * Shift+Arrow sequence began, unioned with the rectangle spanning the two
 * selection corners — recomputed fresh on every press, never accumulated, so
 * the rectangle can shrink back down as freely as it grows.
 *
 * This is the only reader of either corner index in the app; every other site
 * that touches them only seeds them for a Shift+Arrow that may follow.
 */
function recomputeFromRect(
  data: DominoData,
  baseSelection: Set<number>,
  selectionFixedCornerIndex: number,
  selectionMovingCornerIndex: number,
  expansion: DominoExpansion,
): Set<number> {
  const rect = rectFromIndices(
    data,
    selectionFixedCornerIndex,
    selectionMovingCornerIndex,
    expansion,
  );
  const selected = new Set(baseSelection);
  for (const i of enclosedIndices(data, rect, expansion)) selected.add(i);
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

/**
 * One in-progress selection gesture — "sequence" rather than "gesture" because
 * a shape-select variant may span several presses and releases before it calls
 * itself finished. The rectangle band always completes in one press-drag-release.
 */
interface GestureSequenceState {
  startWorld: { x: number; y: number };
  startIndex: number | undefined;
  /**
   * Whether this gesture replaces the selection, adds to it (Ctrl) or removes
   * from it (Alt). Read once, from the sequence's first press, and then fixed —
   * so pressing or releasing Alt part-way through a drag changes nothing, and a
   * shape spanning several presses means one thing from start to finish.
   *
   * Applies to region gestures only: the rectangle rubber band and every shape.
   * A plain click never removes — see the "remove" branch in onPointerUp.
   */
  selectionGestureMode: SelectionGestureMode;
  dragging: boolean;
  /**
   * The selection as it stood when the sequence began. A rubber-band drag now
   * previews live, replacing the stored selection on every frame, so Ctrl+drag's
   * union has to build on this snapshot rather than on the store — which after
   * the first frame holds this very drag's own preview. It is also what Escape
   * mid-drag puts back. Holding the reference is a sound snapshot because every
   * write path calls `replace` with a brand-new entry; nothing mutates one in
   * place.
   */
  before: DominoSelectionEntry | undefined;
  /** Index set last pushed, so a frame that swept nothing new skips the redraw. */
  lastIndices: number[] | undefined;
  /**
   * Set once the armed shape's variant has claimed this sequence, and null
   * while no shape is armed (the rectangle band's case) or the variant returned
   * "ignore" and the plain click branches still apply.
   */
  shape: ShapeGestureSequence | null;
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
 * everything once inside the mode — the light-grey no-fill mode-outline,
 * per-domino click/Ctrl+click/drag/Ctrl+drag/Alt+drag selection, and arrow-key
 * navigation. Mounted unconditionally alongside
 * CreateByRegionTool/SelectionTool; self-arms via early return, like both of
 * those.
 *
 * Selection is not undoable and has no snapshot/rollback — this pass only
 * selects dominoes, it never edits them, so there's nothing to commit or
 * revert; the store write pattern deliberately mirrors that (every gesture
 * calls replace()/clear() directly, no staging).
 */
export default function DominoEditor() {
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

  // Which shape-select gesture is armed, if any — null means the default
  // rectangle rubber band. A primitive, so no useShallow needed. The definition
  // is resolved outside the selector deliberately: a selector that calls an
  // accessor is one refactor away from the React #185 trap the two useShallow
  // subscriptions above exist for.
  const shapeSelectId = useStore((s) => s.dominoShapeSelectId);
  const shapeDefinition = shapeSelectId ? getShapeSelect(shapeSelectId) : undefined;

  // How the edited DDObject's type snaps a point onto its own grid, falling back
  // to NO_SNAP for a type that declares none — so a shape variant can call it
  // unconditionally. Memoized rather than built per event: a pointermove would
  // otherwise allocate a closure per frame. editedDDObject is already subscribed
  // above, and is the only thing the answer depends on.
  const snapShapePoint = useMemo<SnapShapePoint>(() => {
    const fn = editedDDObject ? getSnapShapePoint(editedDDObject) : undefined;
    return fn ? (p) => fn(p.x, p.y) : NO_SNAP;
  }, [editedDDObject]);

  const invalidate = useThree((s) => s.invalidate);
  const scene = useThree((s) => s.scene);
  const raycaster = useThree((s) => s.raycaster);

  const gestureSequenceRef = useRef<GestureSequenceState | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  // The live shape sequence, mirrored out of the ref into React state purely to
  // trigger the preview's repaint — the authoritative copy stays on the ref.
  // Same role dragCurrent plays for the rectangle band, and likewise exactly one
  // setState per frame.
  const [shapeSequence, setShapeSequence] = useState<ShapeGestureSequence | null>(null);
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

  const cancelSequence = () => {
    const g = gestureSequenceRef.current;
    // A drag — rectangle band or shape alike — previews its selection live, so
    // backing out has to put the pre-sequence selection back. Escape mid-drag
    // must leave no trace.
    if ((g?.dragging || g?.shape) && dominoEditingId) {
      const store = useDominoSelectionStore.getState();
      if (g.before) store.replace(dominoEditingId, g.before);
      else store.clear(dominoEditingId);
    }
    gestureSequenceRef.current = null;
    setDragCurrent(null);
    setShapeSequence(null);
    // Back to the armed shape's idle prompt — the mid-sequence text no longer
    // describes anything. Read imperatively rather than from `shapeDefinition`
    // above: the keydown effect below is keyed on dominoEditingId alone, so the
    // copy of this function it captured would otherwise hold whatever was armed
    // when that effect last ran.
    const st = useStore.getState();
    st.setDominoShapeSelectHint(
      st.dominoShapeSelectId ? getShapeSelect(st.dominoShapeSelectId).hint(undefined) : null,
    );
    invalidate();
  };

  // Changing the armed shape, or returning to Rectangle, abandons any sequence
  // in flight. A variant's state is opaque and private to it, so handing a
  // half-drawn polygon's state to circle's nextStep() would not merely be wrong,
  // it would be untyped — pinning the definition inside ShapeGestureSequence is
  // what makes the mismatch detectable at all.
  useEffect(() => {
    if (gestureSequenceRef.current?.shape) cancelSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeSelectId]);

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

      // A plain arrow deliberately ignores the stored corners — it steps from
      // the extreme domino of the whole selection, found above — and only
      // reseeds them, so a Shift+Arrow that follows extends from the domino it
      // just landed on.
      useDominoSelectionStore.getState().replace(dominoEditingId, {
        selected: new Set([target]),
        baseSelection: new Set(),
        selectionFixedCornerIndex: target,
        selectionMovingCornerIndex: target,
      });
      applyLockedColorIfAny();
    };

    const runShiftArrow = (direction: Direction) => {
      const data = useDominoDataStore.getState().get(dominoEditingId);
      const entry = useDominoSelectionStore.getState().get(dominoEditingId);
      if (!data || !entry) return;

      const nextMovingCorner =
        nearestInDirection(data, entry.selectionMovingCornerIndex, direction) ??
        entry.selectionMovingCornerIndex;
      const selected = recomputeFromRect(
        data,
        entry.baseSelection,
        entry.selectionFixedCornerIndex,
        nextMovingCorner,
        resolveDominoExpansion(dominoEditingId),
      );
      useDominoSelectionStore.getState().replace(dominoEditingId, {
        selected,
        baseSelection: entry.baseSelection,
        selectionFixedCornerIndex: entry.selectionFixedCornerIndex,
        selectionMovingCornerIndex: nextMovingCorner,
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
        // Escape backs out one layer at a time, each press making exactly one
        // visible change, so nothing is ever lost by surprise:
        //   1. a sequence in progress (rectangle band or shape) → abandon it
        //      and put the previous selection back. The armed shape stays
        //      armed, so it can be drawn again from scratch.
        //   2. otherwise, dominoes selected → clear the selection. An armed
        //      shape stays armed: this rung is about the selection only.
        //   3. otherwise, a shape armed → disarm back to the default rectangle
        //      band. Reached only once nothing is selected, so it is Escape
        //      twice that gets from "circle armed with a selection" back to
        //      Rectangle.
        //   4. otherwise → release the color lock and any part-typed shortcut
        //      buffer. The lock survives every rung above it, so neither
        //      clearing a selection nor disarming a shape silently unlocks —
        //      the lock has its own badge and its own way out.
        //
        // The order of rungs 2 and 3 is the whole of the rule. Testing the
        // selection *before* the armed shape is what splits them into separate
        // presses; testing them the other way round would collapse both into
        // one press again, which is what this replaced.
        //
        // The toolbar's Rectangle button is still deliberately different: it is
        // a mode change and keeps the selection, where Escape is a back-out and
        // ends with the selection gone. That now takes two presses rather than
        // one, but the distinction is unchanged.
        //
        // Escape never exits the mode itself; only ModeHintBar's Done/Cancel can.
        if (gestureSequenceRef.current?.dragging || gestureSequenceRef.current?.shape) {
          cancelSequence();
          return;
        }
        const entry = useDominoSelectionStore.getState().get(dominoEditingId);
        if (entry && entry.selected.size > 0) {
          useDominoSelectionStore.getState().clear(dominoEditingId);
          return;
        }
        const st = useStore.getState();
        if (st.dominoShapeSelectId) {
          st.setDominoShapeSelect(null);
          return;
        }
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

  /** World coordinates -> the parent-relative mm DominoData.positions lives in. */
  const toLocal = (p: { x: number; y: number }) => ({
    x: p.x - fieldBounds.x,
    y: p.y - fieldBounds.y,
  });

  /**
   * The selection the armed shape's current state implies. Mirrors resolveDrag
   * below — same sameIndices skip, same shared tail — with the shape's own
   * containment test and control points in place of the rectangle's.
   */
  const resolveShapeToSelection = (
    data: DominoData,
    g: GestureSequenceState,
    sequence: ShapeGestureSequence,
    force: boolean,
  ): DominoSelectionEntry | null => {
    const indices = indicesInShape(sequence.definition, sequence.state, data);
    if (!force && g.lastIndices && sameIndices(indices, g.lastIndices)) return null;
    g.lastIndices = indices;
    const points = sequence.definition.controlPoints(sequence.state);
    return selectionFrom(data, indices, {
      before: g.before,
      selectionGestureMode: g.selectionGestureMode,
      selectionFixedCornerPoint: points.selectionFixedCornerPoint,
      selectionMovingCornerPoint: points.selectionMovingCornerPoint,
    });
  };

  /**
   * Feeds one pointer event to the armed shape and applies whatever it decided.
   * Returns false only for "ignore", which is the caller's signal to fall
   * through to the plain click semantics below — circle never returns it, but a
   * future variant may.
   */
  const runNextStep = (
    g: GestureSequenceState,
    kind: ShapeSelectEvent["kind"],
    worldPoint: { x: number; y: number },
  ): boolean => {
    if (!shapeDefinition) return false;
    const step = shapeDefinition.nextStep(
      { kind, point: toLocal(worldPoint), origin: toLocal(g.startWorld), dragging: g.dragging },
      g.shape?.state,
      snapShapePoint,
    );
    if (step.status === "ignore") return false;

    const sequence: ShapeGestureSequence = { definition: shapeDefinition, state: step.state };
    g.shape = sequence;
    setShapeSequence(sequence);

    const data = useDominoDataStore.getState().get(dominoEditingId);
    if (data) {
      const entry = resolveShapeToSelection(data, g, sequence, step.status === "done");
      if (entry) useDominoSelectionStore.getState().replace(dominoEditingId, entry);
    }

    // A variant's hint can change stage mid-sequence. Written only when it
    // actually differs, so a per-pointermove step costs a string compare rather
    // than a store write.
    const st = useStore.getState();
    const nextHint = shapeDefinition.hint(step.state);
    if (st.dominoShapeSelectHint !== nextHint) st.setDominoShapeSelectHint(nextHint);

    if (step.status === "done") {
      // Once, here — never per frame. A locked color applied on every frame of
      // a sequence would paint, and push an undo entry, on each one.
      applyLockedColorIfAny();
      gestureSequenceRef.current = null;
      setShapeSequence(null);
      // Arming is sticky: the tool stays armed for the next shape. Only Escape,
      // or the toolbar's Rectangle button, disarms.
      st.setDominoShapeSelectHint(shapeDefinition.hint(undefined));
      invalidate();
    }
    return true;
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // A new pointer gesture abandons any in-progress shortcut typing.
    if (useStore.getState().dominoColorShortcut) useStore.getState().setDominoColorShortcut("");
    window.clearTimeout(shortcutTimerRef.current);

    // A multi-click sequence stays open across pointerup, so a press with one
    // still in flight continues it rather than starting over. Reusing the same
    // GestureSequenceState is what pins `selectionGestureMode` and `before` to the
    // sequence's FIRST press, which is what makes Ctrl mean "add this whole shape"
    // and Alt "remove this whole shape".
    const live = gestureSequenceRef.current;
    if (live?.shape) {
      runNextStep(live, "press", e.point);
      return;
    }

    const g: GestureSequenceState = {
      startWorld: { x: e.point.x, y: e.point.y },
      // Needed whatever is armed: a press that never travels far enough to
      // become a shape ends up in onPointerUp's plain click branches, which
      // select this domino.
      startIndex: hitDominoIndex(scene, raycaster, dominoEditingId),
      // Alt is tested before Ctrl, so holding both deselects. The two ask for
      // opposite things, and the preview colours have to agree with whichever
      // one wins — showing the white "adding" colours while dominoes were being
      // removed would read as a bug.
      selectionGestureMode: e.altKey ? "remove" : e.ctrlKey || e.metaKey ? "add" : "replace",
      dragging: false,
      before: useDominoSelectionStore.getState().get(dominoEditingId),
      lastIndices: undefined,
      shape: null,
    };
    gestureSequenceRef.current = g;
    // Deliberately does NOT start an armed shape here. A shape only begins once
    // the pointer has actually travelled (see onPointerMove), so that a press
    // which never moves stays an ordinary click — selecting the domino under it,
    // exactly as it would with the rectangle band. Starting the shape on the
    // press is what used to make single-domino clicking unavailable whenever
    // anything was armed.
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
  const resolveDragToSelection = (
    data: DominoData,
    g: GestureSequenceState,
    endWorld: { x: number; y: number },
    force: boolean,
  ): DominoSelectionEntry | null => {
    const startLocal = toLocal(g.startWorld);
    const endLocal = toLocal(endWorld);
    const rect: Rect = {
      minX: Math.min(startLocal.x, endLocal.x),
      maxX: Math.max(startLocal.x, endLocal.x),
      minY: Math.min(startLocal.y, endLocal.y),
      maxY: Math.max(startLocal.y, endLocal.y),
    };
    const touched = touchedIndices(data, rect, resolveDominoExpansion(dominoEditingId));
    if (!force && g.lastIndices && sameIndices(touched, g.lastIndices)) return null;
    g.lastIndices = touched;

    // The Ctrl union and the corner seeding are shared with every shape-select
    // variant (shape-select/dispatcher.ts) so the two can't drift. The corners
    // track the drag's actual start/end points, not the rectangle's normalized
    // corners, so Shift+Arrow always extends from wherever the gesture ended,
    // whichever corner that geometrically was — mirrors Excel's
    // click-drag-then-shift-arrow behavior.
    return selectionFrom(data, touched, {
      before: g.before,
      selectionGestureMode: g.selectionGestureMode,
      selectionFixedCornerPoint: startLocal,
      selectionMovingCornerPoint: endLocal,
    });
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const g = gestureSequenceRef.current;
    if (!g) return;
    const dx = e.point.x - g.startWorld.x;
    const dy = e.point.y - g.startWorld.y;
    if (!g.dragging && Math.hypot(dx, dy) >= DRAG_THRESHOLD_MM) g.dragging = true;

    if (shapeDefinition) {
      // Opening the sequence is gated on g.dragging, but only for its very
      // first step: until the pointer has travelled DRAG_THRESHOLD_MM the
      // gesture is still a possible click, and a click has to reach the plain
      // branches in onPointerUp so it selects the domino under it. Once the
      // sequence is open every move is passed straight through, ungated — which
      // is what lets a multi-stage variant track the cursor between clicks with
      // the button up.
      if (!g.shape) {
        if (!g.dragging) return;
        // A variant that answered "ignore" has declined the gesture; leave it to
        // the click branches rather than pressing on with a move it never saw a
        // press for. Nothing declines today.
        if (!runNextStep(g, "press", e.point)) return;
      }
      runNextStep(g, "move", e.point);
      return;
    }

    if (!g.dragging) return;
    setDragCurrent({ x: e.point.x, y: e.point.y });

    // Preview which dominoes the box has swept so far. Deliberately no
    // applyLockedColorIfAny here: that would paint — and push an undo entry —
    // on every frame of the drag. A locked color is applied once, at pointerup.
    const data = useDominoDataStore.getState().get(dominoEditingId);
    if (!data) return;
    const entry = resolveDragToSelection(data, g, { x: e.point.x, y: e.point.y }, false);
    if (entry) useDominoSelectionStore.getState().replace(dominoEditingId, entry);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const g = gestureSequenceRef.current;
    if (!g) return;

    // g.shape is the load-bearing part: a press that never travelled far enough
    // to open a sequence falls straight through to the click branches below,
    // which is the whole of "a click behaves the same whatever is armed".
    if (shapeDefinition && g.shape && runNextStep(g, "release", e.point)) {
      // "done" — runNextStep already committed the selection and ended the
      // sequence. "active" — a multi-click sequence still accumulating, so the
      // ref deliberately stays alive for the next press.
      setDragCurrent(null);
      invalidate();
      return;
    }

    // No shape armed, a shape armed but never started by this gesture, or the
    // variant returned "ignore": the original four branches, unchanged.
    gestureSequenceRef.current = null;

    const data = useDominoDataStore.getState().get(dominoEditingId);
    const selectionStore = useDominoSelectionStore.getState();

    if (data) {
      if (g.dragging) {
        // Same resolve the live preview has been running; forced, so the final
        // state is committed even if this frame swept nothing new.
        const entry = resolveDragToSelection(data, g, { x: e.point.x, y: e.point.y }, true);
        if (entry) selectionStore.replace(dominoEditingId, entry);
        applyLockedColorIfAny();
      } else if (g.selectionGestureMode === "remove") {
        // Alt was held, but this was a click rather than a drag. If the domino
        // clicked on was selected, take it back out of the selection; do
        // nothing otherwise.
        //
        // Deliberately its own branch rather than falling through to the click
        // branches below: those would replace the whole selection with the
        // single domino under the cursor, and an Alt+click on empty space would
        // clear the selection outright — both the opposite of what someone
        // holding Alt is asking for.
        //
        // Nothing to do at all when there is no selection entry for this field
        // yet, which is also what keeps the two corner reads below safe. Note
        // the index test is against undefined, not truthiness: index 0 is the
        // field's first domino, not a missing one.
        const prevEntry = selectionStore.get(dominoEditingId);
        if (prevEntry && g.startIndex !== undefined && prevEntry.selected.has(g.startIndex)) {
          const selected = new Set(prevEntry.selected);
          selected.delete(g.startIndex);

          // The two corners carry over untouched: nothing was *added* for a
          // following Shift+Arrow to extend from, and pointing a corner at the
          // domino that just left the selection would be meaningless. No locked
          // color to apply either — a remove paints nothing.
          selectionStore.replace(dominoEditingId, {
            selected,
            baseSelection: new Set(selected),
            selectionFixedCornerIndex: prevEntry.selectionFixedCornerIndex,
            selectionMovingCornerIndex: prevEntry.selectionMovingCornerIndex,
          });
        }
      } else if (g.startIndex === undefined) {
        // Click on empty space.
        if (g.selectionGestureMode !== "add") selectionStore.clear(dominoEditingId);
      } else if (g.selectionGestureMode === "add") {
        // Toggle in/out of the current selection. The corners only reseed on
        // toggle-on — pointing them at a domino that just got deselected would
        // be meaningless for a future Shift+Arrow.

        const prevEntry = selectionStore.get(dominoEditingId);
        const selected = new Set(prevEntry?.selected ?? []);
        const wasSelected = selected.has(g.startIndex);
        if (wasSelected) selected.delete(g.startIndex);
        else selected.add(g.startIndex);

        selectionStore.replace(dominoEditingId, {
          selected,
          baseSelection: new Set(selected),
          selectionFixedCornerIndex: wasSelected
            ? prevEntry!.selectionFixedCornerIndex
            : g.startIndex,
          selectionMovingCornerIndex: wasSelected
            ? prevEntry!.selectionMovingCornerIndex
            : g.startIndex,
        });
        applyLockedColorIfAny();
      } else {
        // Plain click: replace the whole selection with just this domino.
        selectionStore.replace(dominoEditingId, {
          selected: new Set([g.startIndex]),
          baseSelection: new Set(),
          selectionFixedCornerIndex: g.startIndex,
          selectionMovingCornerIndex: g.startIndex,
        });
        applyLockedColorIfAny();
      }
    }

    setDragCurrent(null);
    invalidate();
  };

  // Capitalised local binding: JSX can't render a member expression as a
  // component.
  const ShapePreview = shapeSequence?.definition.Preview;

  // Which colours the region being swept out draws itself in — white while it
  // is selecting, dark while Alt is deselecting. Read straight off the ref, the
  // same way dragStart below is: the ref is always populated before the render
  // that setDragCurrent/setShapeSequence triggers. Defaults to the selecting
  // colours between gestures, when there is no region on screen to colour.
  //
  // Handed to both the rectangle band's own materials and the armed shape's
  // Preview, so the two can never disagree about what a colour means.
  const previewStyle = previewStyleFor(
    gestureSequenceRef.current?.selectionGestureMode ?? "replace",
  );

  const dragStart = gestureSequenceRef.current?.startWorld;
  const dragRect: DDObjectBounds | null =
    dragCurrent && dragStart && !shapeDefinition
      ? {
          x: Math.min(dragStart.x, dragCurrent.x),
          y: Math.min(dragStart.y, dragCurrent.y),
          width: Math.abs(dragStart.x - dragCurrent.x),
          height: Math.abs(dragStart.y - dragCurrent.y),
        }
      : null;

  return (
    <>
      {/* Light grey, no-fill context indicator — this DDObject's dominoes are
          being edited. No resize handles: nothing in this pass changes the
          field's own shape from inside the mode. Drawn a fixed margin off the
          dominoes rather than on the element's bounds, so it clears them by the
          same gap whether or not the Expand toggle is on — see modeOutlineRect. */}
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
          <lineBasicMaterial color={MODE_OUTLINE_COLOR} transparent depthTest={false} />
        </lineSegments>
      )}

      {/* Catches every gesture in the mode — well beyond the build plane, not
          just the field's own footprint, so a selection can start and end
          anywhere (see CATCH_SIZE). Transparent, not invisible, so it still
          raycasts. Centred on the build plane so it stays symmetric about what
          the user is looking at. One plane rather than a second mounted
          mid-gesture, so no two handler meshes ever compete for the same
          pointerdown. */}
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
        <planeGeometry args={[CATCH_SIZE, CATCH_SIZE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {dragRect && dragRect.width > 0 && dragRect.height > 0 && (
        <>
          <mesh
            position={[dragRect.x + dragRect.width / 2, dragRect.y + dragRect.height / 2, PREVIEW_FILL_Z]}
            renderOrder={PREVIEW_ORDER}
          >
            <planeGeometry args={[dragRect.width, dragRect.height]} />
            <meshBasicMaterial
              color={previewStyle.fillColor}
              transparent
              opacity={previewStyle.fillOpacity}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
          <lineSegments
            geometry={unitEdges}
            position={[dragRect.x + dragRect.width / 2, dragRect.y + dragRect.height / 2, PREVIEW_BORDER_Z]}
            scale={[dragRect.width, dragRect.height, 1]}
            renderOrder={PREVIEW_BORDER_ORDER}
          >
            <lineBasicMaterial color={previewStyle.borderColor} transparent depthTest={false} />
          </lineSegments>
        </>
      )}

      {/* The armed shape's own live preview. The <group> is a three.js node that
          applies its transform to everything nested inside it — putting one at
          the edited DDObject's origin is the whole of the world <-> parent-relative
          conversion, done once here for every variant rather than each of them
          subtracting fieldBounds itself and one eventually getting it wrong. */}
      {ShapePreview && shapeSequence && (
        <group position={[fieldBounds.x, fieldBounds.y, 0]}>
          <ShapePreview state={shapeSequence.state} previewStyle={previewStyle} />
        </group>
      )}
    </>
  );
}