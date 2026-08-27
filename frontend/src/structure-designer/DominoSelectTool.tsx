import { useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import {
  JUNCTION_DOT_LIFT_MM,
  SELECT_BAND_COLOR,
  SELECT_BAND_EDGE_OPACITY,
  SELECT_BAND_FILL_OPACITY,
  SELECT_BAND_RENDER_ORDER,
} from "./constants";
import { dominoUnderPointer } from "./dominoPicking";
import LayerPickPlane, { captureTarget } from "./LayerPickPlane";
import { effectiveDominoGroup } from "./operation-types/dominoGroup/dominoes";
import {
  boxFootprintTouchesRect,
  type PlaneRect,
} from "./operation-types/dominoGroup/overlap";
import { useDominoBoxes } from "./operation-types/dominoGroup/useDominoBoxes";
import { layerFloorMm } from "./operation-types/layerDefinition/layers";
import { useLayerHeights } from "./operation-types/layerDefinition/useLayerHeights";
import { useStructureStore } from "./store";

/** A square of side one, lying flat, which the band is drawn from. */
const UNIT_QUAD = new THREE.PlaneGeometry(1, 1);
/** Its four edges, so the band gets an outline without a second quad. */
const UNIT_QUAD_EDGES = new THREE.EdgesGeometry(UNIT_QUAD);

const bandFillMaterial = new THREE.MeshBasicMaterial({
  color: SELECT_BAND_COLOR,
  transparent: true,
  opacity: SELECT_BAND_FILL_OPACITY,
  // A see-through surface must not record its own distance from the camera, or
  // it would punch a hole in whatever is drawn after it.
  depthWrite: false,
  // So the band is not swallowed by the dominoes it is being dragged across.
  depthTest: false,
  side: THREE.DoubleSide,
});

/**
 * How far the pointer has to move, in screen pixels, before a press counts as a
 * band being dragged rather than a click.
 *
 * Some movement always arrives — a hand on a mouse is not still — so without a
 * threshold every click would be read as a drag of a rectangle with no size, and
 * a click meant to take one domino would clear the selection instead.
 *
 * **In pixels rather than millimetres**, because the same jitter of the hand
 * covers a hundred times as many millimetres zoomed out as zoomed in, and it is
 * the hand this is measuring.
 */
const DRAG_THRESHOLD_PX = 3;

const bandEdgeMaterial = new THREE.LineBasicMaterial({
  color: SELECT_BAND_COLOR,
  transparent: true,
  opacity: SELECT_BAND_EDGE_OPACITY,
  depthWrite: false,
  depthTest: false,
});

/**
 * Selecting placed dominoes: a click on one, or a rectangle dragged over many.
 *
 * ## The gesture
 *
 * A left-drag on the layer draws a rectangle, and **every domino it touches is
 * selected as it is dragged**, not on release — the band's job is to show what it
 * is about to take. A press that never moves is a click, and takes the one domino
 * under the pointer; a click on nothing clears the selection.
 *
 * Ctrl adds to what was already selected rather than replacing it, which is the
 * modifier the Designer's domino editing uses for the same thing.
 *
 * Escape gives up a band in progress and puts back the selection as it stood when
 * the press happened. With no band in progress it goes back to placing dominoes —
 * the escalating ladder the Designer's region tool uses, and the reason the
 * screen's own keyboard handler never sees Escape at all.
 *
 * ## Which dominoes are eligible
 *
 * **The layer being worked on and every layer above it**, or that layer alone
 * when Hide Dominoes Above is on. The rule is that the band takes what it can
 * see: a rectangle drawn straight down over a structure catches everything
 * standing in that column, and turning the upper layers off is how the user says
 * they only want this course.
 *
 * The layers *below* are deliberately never taken. They are behind the sheet the
 * band is drawn on, and taking things the user is looking through a grey sheet at
 * would be a surprise.
 *
 * ## Resolving from the press, never from what is selected now
 *
 * Each frame of a drag works the selection out from the set snapshotted when the
 * button went down. Building on the stored selection instead would mean building
 * on this same drag's previous frame, and a band swept back and forth would
 * accumulate everything it had ever touched rather than holding what it covers
 * now. The Designer's rubber band is written under the same rule.
 */
export default function DominoSelectTool() {
  const layer = useStructureStore((s) => s.layer);
  const hideDominoesAbove = useStructureStore((s) => s.hideDominoesAbove);
  const operations = useStructureStore((s) => s.operations);
  const selectDominoes = useStructureStore((s) => s.selectDominoes);
  const clearDominoSelection = useStructureStore((s) => s.clearDominoSelection);
  const setTool = useStructureStore((s) => s.setTool);
  const modifying = useStructureStore((s) => s.modifyingOperationId !== null);
  const armed = useStructureStore((s) => s.tool === "rectangleSelect");

  const heights = useLayerHeights();
  const boxes = useDominoBoxes();
  const floorZ = layerFloorMm(heights, layer);

  /*
   * Where the band started, plus what the selection was and whether Ctrl was
   * held — all captured at the press.
   *
   * A ref rather than state because every handler has to see what the one before
   * it wrote in the same gesture, and because clearing it is what makes a pending
   * release after an Escape do nothing.
   */
  const bandRef = useRef<{
    startX: number;
    startY: number;
    before: ReadonlySet<number>;
    additive: boolean;
    /** Where the press landed on screen, for the click-or-drag test. */
    pressClientX: number;
    pressClientY: number;
    /** Whether the pointer has moved far enough to count — see DRAG_THRESHOLD_PX. */
    moved: boolean;
    /**
     * What the band caught last time it was worked out, so a movement that
     * changes nothing writes nothing.
     *
     * A band dragged over a dense structure spends most of its frames covering
     * exactly the dominoes it covered on the frame before, and every write
     * repaints their outlines. The lists are built in ascending order, so
     * comparing them is a walk down two arrays — far cheaper than the redraw it
     * saves.
     */
    caught: number[];
  } | null>(null);

  // Only to redraw the band. The rectangle itself is worked out from this and the
  // ref together.
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);

  /** Which dominoes this band is allowed to take — see the note above. */
  const eligible = useMemo(() => {
    const group = effectiveDominoGroup(operations);
    if (!group) return [];
    const allowed: number[] = [];
    for (let i = 0; i < group.dominoes.length && i < boxes.length; i++) {
      const on = group.dominoes[i].layer;
      if (on < layer) continue;
      if (hideDominoesAbove && on > layer) continue;
      allowed.push(i);
    }
    return allowed;
  }, [operations, boxes, layer, hideDominoesAbove]);

  const giveUp = () => {
    const band = bandRef.current;
    bandRef.current = null;
    setCorner(null);
    // Put back what was selected before the band was drawn. Everything since has
    // been this drag's own preview.
    if (band) selectDominoes(band.before);
  };

  /*
   * Escape, in two levels: a band in progress is abandoned, and otherwise the
   * canvas goes back to placing dominoes.
   *
   * Bound here rather than in the screen's keyboard handler because only this
   * component knows whether there is a band to abandon. That is also why Escape
   * is not among the keys structureToolForKey answers to.
   */
  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bandRef.current) giveUp();
      else setTool("createDominoes");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // giveUp is rebuilt every render but only reaches the ref and the store's own
    // actions, both of which are stable, so it is not a dependency.
  }, [armed, setTool, selectDominoes]);

  // Leaving the tool with a band half-drawn must not strand the preview
  // selection, which would otherwise stay on screen with nothing holding it.
  useEffect(() => {
    if (!armed && bandRef.current) giveUp();
  }, [armed]);

  if (!armed || modifying) return null;

  /** The rectangle the band currently covers, or null when there is not one. */
  const bandRect = (): PlaneRect | null => {
    const band = bandRef.current;
    if (!band || !corner) return null;
    return {
      minX: Math.min(band.startX, corner.x),
      minY: Math.min(band.startY, corner.y),
      maxX: Math.max(band.startX, corner.x),
      maxY: Math.max(band.startY, corner.y),
    };
  };

  /** Whether two ascending lists of indexes hold the same entries. */
  const sameIndices = (a: readonly number[], b: readonly number[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Any other button belongs to the view controls; one arriving mid-band means
    // a pan is starting, and a rectangle left growing under a moving camera would
    // be nonsense.
    if (e.button !== 0) {
      if (bandRef.current) giveUp();
      return;
    }
    bandRef.current = {
      startX: e.point.x,
      startY: e.point.y,
      before: useStructureStore.getState().selectedDominoes,
      additive: e.ctrlKey || e.metaKey,
      pressClientX: e.nativeEvent.clientX,
      pressClientY: e.nativeEvent.clientY,
      moved: false,
      caught: [],
    };
    setCorner({ x: e.point.x, y: e.point.y });
    captureTarget(e).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const band = bandRef.current;
    if (!band) return;

    // Once it counts as a drag it stays one, so that coming back over the point
    // it started from does not turn a band into a click.
    if (
      !band.moved &&
      Math.hypot(
        e.nativeEvent.clientX - band.pressClientX,
        e.nativeEvent.clientY - band.pressClientY,
      ) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    band.moved = true;
    setCorner({ x: e.point.x, y: e.point.y });

    const rect: PlaneRect = {
      minX: Math.min(band.startX, e.point.x),
      minY: Math.min(band.startY, e.point.y),
      maxX: Math.max(band.startX, e.point.x),
      maxY: Math.max(band.startY, e.point.y),
    };

    // Ascending, because that is what lets the comparison below be a walk down
    // two arrays.
    const caught = eligible.filter((i) => boxFootprintTouchesRect(boxes[i], rect));
    if (sameIndices(caught, band.caught)) return;
    band.caught = caught;
    selectDominoes(band.additive ? [...band.before, ...caught] : caught);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const band = bandRef.current;
    // No band in flight means this release follows an Escape — ignore it.
    if (!band) return;
    captureTarget(e).releasePointerCapture(e.pointerId);
    bandRef.current = null;
    setCorner(null);

    if (band.moved) {
      // Already resolved on the last movement; nothing more to do than let it
      // stand.
      return;
    }

    // A press that never moved is a click on whatever was under the pointer.
    const domino = dominoUnderPointer(boxes, e);
    if (domino >= 0) selectDominoes([domino], band.additive);
    else if (!band.additive) clearDominoSelection();
  };

  const rect = bandRect();

  return (
    <>
      <LayerPickPlane
        floorZ={floorZ}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {rect && rect.maxX > rect.minX && rect.maxY > rect.minY && (
        // Drawn a hair above the pick plane for the same reason the junction dots
        // are: at layer 1 the layer's floor is the build plane itself.
        <group
          position={[
            (rect.minX + rect.maxX) / 2,
            (rect.minY + rect.maxY) / 2,
            floorZ + JUNCTION_DOT_LIFT_MM,
          ]}
          scale={[rect.maxX - rect.minX, rect.maxY - rect.minY, 1]}
        >
          {/* The order is set on each drawn thing rather than on the group, which
              is only a frame holding them and is never drawn itself. */}
          <mesh
            geometry={UNIT_QUAD}
            material={bandFillMaterial}
            renderOrder={SELECT_BAND_RENDER_ORDER}
          />
          <lineSegments
            geometry={UNIT_QUAD_EDGES}
            material={bandEdgeMaterial}
            renderOrder={SELECT_BAND_RENDER_ORDER}
          />
        </group>
      )}
    </>
  );
}