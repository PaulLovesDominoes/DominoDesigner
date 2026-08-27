import { useEffect, useMemo, useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import {
  JUNCTION_DOT_LIFT_MM,
  JUNCTION_HIGHLIGHT_COLOR,
  JUNCTION_HIGHLIGHT_RENDER_ORDER,
  JUNCTION_HIGHLIGHT_SIZE_PX,
} from "./constants";
import { dominoUnderPointer } from "./dominoPicking";
import {
  dominoPreviewEdgeMaterial,
  dominoPreviewFillMaterial,
  UNIT_BOX,
  UNIT_BOX_EDGES,
} from "./DominoMeshes";
import LayerPickPlane, { captureTarget } from "./LayerPickPlane";
import {
  attachSpanMm,
  dominoFromDrag,
  dominoFromPoints,
  placedDominoPlacement,
  SPAN_MATCH_EPS_MM,
  type PlacedDomino,
} from "./operation-types/dominoGroup/dominoes";
import {
  boxesOverlap,
  dominoBox,
  pointInBoxFootprint,
} from "./operation-types/dominoGroup/overlap";
import { useDominoBoxes } from "./operation-types/dominoGroup/useDominoBoxes";
import {
  junctionInWedge,
  nearestJunctionIndex,
} from "./operation-types/gridDefinition/junctions";
import { layerFloorMm } from "./operation-types/layerDefinition/layers";
import { useLayerHeights } from "./operation-types/layerDefinition/useLayerHeights";
import {
  arrowDirectionForKey,
  screenPlaneDirections,
  type ArrowDirection,
} from "./screenDirections";
import { useLayerJunctions } from "./useLayerJunctions";
import { useStructureStore } from "./store";

/**
 * The wedge a Shift+arrow hunts in, clockwise of the arrow's own direction.
 *
 * Twenty to seventy degrees — a wedge centred on the forty-five a rectangular
 * grid puts its diagonal neighbour at, wide enough to take in the thirty and
 * sixty an isometric or hexagonal grid uses. On a clock face, Shift+Up looks
 * between three minutes twenty seconds and eleven minutes forty.
 *
 * A single direction would have been right for one grid and wrong for the rest.
 * See junctionInWedge.
 */
const DIAGONAL_WEDGE_MIN_RAD = (20 * Math.PI) / 180;
const DIAGONAL_WEDGE_MAX_RAD = (70 * Math.PI) / 180;

/**
 * How far off rightward the mark may land when it moves on after a placement —
 * a quarter-turn either side, so the wedge straddles the direction itself and
 * its lower bound comes round past a full turn.
 *
 * A quarter-turn is wide because the wedge is only saying which junctions count
 * as being rightward *at all*. Which of them is chosen is the search's
 * `ranking`, and the step asks for the straightest rather than the nearest, so
 * a junction well off to one side never wins while one along the line is free.
 */
const ADVANCE_CONE_MIN_RAD = Math.PI * 2 - Math.PI / 4;
const ADVANCE_CONE_MAX_RAD = Math.PI / 4;

/**
 * Placing dominoes by dragging from one junction toward another.
 *
 * ## The gesture
 *
 * Moving the pointer over the layer marks the junction nearest it. Pressing the
 * left button pins the near attachment point of a domino to that junction; while
 * the button is held, the junction nearest the pointer says which way the domino
 * faces, and the domino turns about its pinned end to point that way. Letting go
 * places it. Escape, or a press of any other button, gives up.
 *
 * The second junction says only *which way*, never *how far*: a domino is the
 * length it is. When the two junctions happen to be exactly one attachment span
 * apart — which they are for a run laid along a grid built on either overlap
 * spacing — the domino's far end lands on the second junction, and both ends are
 * recorded as sitting on the grid. See dominoFromDrag.
 *
 * **A press with no movement places nothing.** Two junctions that are the same
 * junction give no direction to face, so there is nothing to place; and since
 * the left button places dominoes at all times, with no tool to switch off and
 * as yet no way to remove one domino, a stray click had better not leave one
 * behind.
 *
 * ## Dominoes may not run into each other
 *
 * Two things follow from that rule, and both are refusals the user sees rather
 * than errors they are told about:
 *
 * - **A junction with something already standing on it is not marked, and a
 *   press over one starts no drag at all.** The dot itself is still drawn — it is
 *   simply hidden by the domino on top of it — so the mark going out is the whole
 *   of what says that this junction cannot be used. The search still runs over
 *   every junction rather than over the free ones only, so a press over a buried
 *   one is recognised as landing on that junction and quietly does nothing, where
 *   searching the free ones alone would have snapped the press to some free
 *   junction elsewhere. See useLayerJunctions.
 * - **A domino that would run into another is not drawn and is not placed.** The
 *   junction being aimed at is still marked, so the direction stays readable; the
 *   domino simply does not appear, which says plainly that it will not go there.
 *   The release tests again rather than trusting what was last drawn, since a
 *   release can arrive from a position no movement reported.
 *
 * What counts as running into another is operation-types/dominoGroup/overlap.ts,
 * which also explains why two dominoes cannot be laid end to end on either
 * overlap grid — the thing about this rule most likely to look like a fault.
 *
 * ## Laying dominoes with the arrow keys
 *
 * The arrows place from the marked junction without touching the mouse, and the
 * plain and the Shift versions are two different searches on purpose.
 *
 * - **A plain arrow goes exactly the way it looks.** Up is up: the direction is
 *   one of the four sides of the build plane, chosen for how the view happens to
 *   be turned (screenDirections.ts), and nothing negotiates it. The far end is
 *   placed one attachment span along; if a junction sits exactly there it is used
 *   as the aiming point, and otherwise the domino simply points that way with its
 *   far end recorded as off the grid.
 * - **A Shift+arrow hunts for a diagonal neighbour.** It sweeps a wedge clockwise
 *   of the arrow's direction and takes whatever junction it finds, preferring one
 *   exactly a span away. Fixing it at forty-five degrees instead would suit a
 *   rectangular grid and miss the thirty- and sixty-degree neighbours every other
 *   grid has. An empty wedge places nothing, because the whole gesture was "find
 *   me a diagonal neighbour" and there is no direction to fall back on.
 *
 * After either, **the mark steps rightward** — always rightward, whichever way
 * the domino itself went, so holding an arrow lays a wall marching across the
 * screen rather than piling dominoes on one spot. Rightward is a screen
 * direction like the arrows themselves, so it follows the view being turned. It
 * steps past whatever is standing in the way, **the domino just laid included**,
 * so a sideways domino on either overlap grid — which is longer than the gap
 * between two junctions and covers the one to its right — moves the mark on to
 * the junction after that.
 *
 * It used to be a quarter-turn clockwise of the way the domino went, which
 * meant Down and Left walked leftward and a course could be laid in either
 * direction depending on which arrow started it. One direction is easier to
 * predict, and building a course left to right is what the hand expects.
 *
 * ## A click that goes nowhere selects instead
 *
 * A press with no direction was already doing nothing, so it is free to mean
 * something else: it takes the domino under the pointer into the selection, with
 * Ctrl to add rather than replace. Press-and-drag still places, so the two do not
 * compete. Which domino a click landed on is dominoPicking.ts, which explains why
 * the dominoes carry no pointer handlers of their own.
 *
 * ## Where the pick plane sits
 *
 * The invisible surface the pointer is measured against is LayerPickPlane, shared
 * with the select tool. **The height it sits at is load-bearing** — see its own
 * header. The domino is then placed at the layer's floor, not at that height.
 *
 * ## Not stepping on the view controls
 *
 * Only the left button is answered, which is enough. StructureCanvas leaves the
 * left button unassigned in OrbitControls for exactly this, and the right-button
 * gestures cannot be disturbed from here: ShiftRotateGesture listens in the
 * capture phase, which runs before react-three-fiber dispatches anything into
 * the scene, and OrbitControls listens to the canvas element directly, where
 * stopping propagation between scene objects has no effect at all.
 *
 * Nothing calls invalidate(). The canvas only redraws when something changes,
 * and everything here is component state inside the <Canvas>, so React
 * re-rendering it is itself what asks for the redraw.
 */
export default function DominoPlacementTool() {
  const layer = useStructureStore((s) => s.layer);
  const orientation = useStructureStore((s) => s.dominoOrientation);
  const placeDomino = useStructureStore((s) => s.placeDomino);
  const selectDominoes = useStructureStore((s) => s.selectDominoes);
  const clearDominoSelection = useStructureStore((s) => s.clearDominoSelection);
  const modifying = useStructureStore((s) => s.modifyingOperationId !== null);
  const armed = useStructureStore((s) => s.tool === "createDominoes");
  const pointerOverCanvas = useStructureStore((s) => s.pointerOverCanvas);

  // Which way is up on the plane depends on where the camera is looking, and the
  // arrow keys have to follow it. See screenDirections.
  const camera = useThree((s) => s.camera);

  const heights = useLayerHeights();
  const { points: junctions, blocked } = useLayerJunctions();
  const boxes = useDominoBoxes();
  const floorZ = layerFloorMm(heights, layer);

  /*
   * Junctions are held as indexes into the flat run of coordinates rather than
   * as points, which is what keeps a pointer that has moved a few pixels from
   * costing anything: React skips re-rendering when state has not changed, and
   * two equal numbers are the same state where two freshly built points would
   * never be.
   */
  const [hoveredJunction, setHoveredJunction] = useState(-1);
  const [anchorJunction, setAnchorJunction] = useState(-1);

  const dragging = anchorJunction >= 0;

  /*
   * The domino the press landed on, if it landed on one, and whether Ctrl was
   * held at the time.
   *
   * A ref rather than state because nothing looks different for it: it is only
   * read again on the release, and only then to answer a press that turned out
   * not to be a placement. Held from pointerdown because that is when the ray is
   * pointing where the user meant — by the release it may have moved.
   */
  const pressedRef = useRef<{ domino: number; additive: boolean } | null>(null);

  const junctionAt = useMemo(
    () =>
      (index: number): [number, number] | undefined =>
        index >= 0 && index * 2 + 1 < junctions.length
          ? [junctions[index * 2], junctions[index * 2 + 1]]
          : undefined,
    [junctions],
  );

  /** Whether something is already standing on this junction. */
  const isBlocked = (index: number) => index >= 0 && blocked[index] === 1;

  /**
   * Whether this domino would run into one already placed.
   *
   * A plain walk through every box, which is a few tens of thousands of cheap
   * comparisons at the size a real structure reaches and comfortably inside a
   * frame — see useDominoBoxes, which is where the boxes are built once and
   * shared, and spaceIndex.ts, which explains why sorting them by position is
   * worth it for one caller and not for this one.
   */
  const wouldOverlap = (domino: PlacedDomino) => {
    const box = dominoBox(domino, floorZ);
    return boxes.some((placed) => boxesOverlap(box, placed));
  };

  const giveUp = () => {
    setAnchorJunction(-1);
  };

  // Escape abandons a drag in progress. Bound only while one is running, so a
  // press of Escape at any other time is nobody's business here — the select tool
  // owns Escape when there is no drag, and takes the canvas back to placing.
  useEffect(() => {
    if (!dragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") giveUp();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dragging]);

  /**
   * Laying a domino from the marked junction with an arrow key.
   *
   * See the header for what the two gestures are and why they are two.
   */
  const layTowardArrow = (arrow: ArrowDirection, diagonal: boolean) => {
    const from = junctionAt(hoveredJunction);
    if (!from || isBlocked(hoveredJunction)) return;

    const directions = screenPlaneDirections(camera);
    const axis = directions[arrow];
    const span = attachSpanMm(orientation);

    /** Where to aim, and which way the domino ended up going. */
    let toward: readonly [number, number] | undefined;
    /**
     * Whether the aiming point is itself a junction, which is what decides how
     * the domino is built below: a point off the grid has to be told that it is,
     * where two junctions can be measured.
     */
    let towardIsJunction = false;

    if (diagonal) {
      // Whichever junction sits in the wedge clockwise of the arrow, preferring
      // one exactly a span away so that both ends land on the grid when the grid
      // allows it. Nothing in the wedge means nothing is placed: unlike a plain
      // arrow there is no direction to fall back on, because the whole gesture
      // was "find me a diagonal neighbour".
      const found = junctionInWedge(junctions, {
        fromX: from[0],
        fromY: from[1],
        dirX: axis[0],
        dirY: axis[1],
        minAngleRad: DIAGONAL_WEDGE_MIN_RAD,
        maxAngleRad: DIAGONAL_WEDGE_MAX_RAD,
        preferredDistanceMm: span,
        toleranceMm: SPAN_MATCH_EPS_MM,
        isExcluded: isBlocked,
      });
      const point = junctionAt(found);
      if (!point) return;
      toward = point;
      towardIsJunction = true;
    } else {
      // Straight along the axis, whatever the grid holds that way. A junction
      // sitting exactly where the far end would land is used as the aiming point
      // so that the coordinate stored is the junction's own.
      const target: readonly [number, number] = [
        from[0] + axis[0] * span,
        from[1] + axis[1] * span,
      ];
      const nearest = nearestJunctionIndex(junctions, target[0], target[1]);
      const point = junctionAt(nearest);
      const onGrid =
        point !== undefined &&
        Math.hypot(point[0] - target[0], point[1] - target[1]) < SPAN_MATCH_EPS_MM;
      toward = onGrid ? point : target;
      towardIsJunction = onGrid;
    }

    /*
     * Two junctions can be measured, so dominoFromDrag works the anchor out for
     * itself. A point built one span away cannot: it measures as being exactly a
     * span from the start, which is the very test dominoFromDrag uses, so it
     * would be recorded as on the grid when it is a coordinate this file made up.
     * Hence the flag.
     */
    const domino = towardIsJunction
      ? dominoFromDrag(orientation, layer, from, toward)
      : dominoFromPoints(orientation, layer, from, toward, false);
    if (!domino || wouldOverlap(domino)) return;
    placeDomino(domino);

    /*
     * The mark then steps to the next free junction rightward — always
     * rightward, whichever way the domino itself went, so that holding an arrow
     * lays a wall marching across the screen rather than piling dominoes onto
     * one spot. Rightward on screen, so it follows the view being turned.
     *
     * Only on a placement that actually happened, and only onto a junction that
     * is free and roughly that way; with nothing in that quarter of the plane the
     * mark stays where it is. Moving the pointer puts the mark back under it,
     * which is inherent to the mark being the hover and is why the keyboard flow
     * is meant to be used with the mouse still.
     *
     * **The domino just placed has to be counted as standing in the way, and it
     * is not in `blocked` yet.** That array was worked out from the structure as
     * it was when this handler was built, which is before the placement a line
     * or two above; the store has been written, but nothing has re-rendered.
     * Without the extra test the mark stepped onto a junction the new domino was
     * already covering — the ordinary case, not a corner one: a sideways domino
     * is longer than the gap between two junctions on either overlap grid, so
     * pressing Right lands it squarely over the junction immediately to the
     * right, and the mark has to carry on to the one after that. Which is
     * exactly the gap a bridging domino on the next layer up is meant to close.
     */
    const placedBox = dominoBox(domino, floorZ);
    const step = junctionInWedge(junctions, {
      fromX: from[0],
      fromY: from[1],
      dirX: directions.right[0],
      dirY: directions.right[1],
      minAngleRad: ADVANCE_CONE_MIN_RAD,
      maxAngleRad: ADVANCE_CONE_MAX_RAD,
      // Along the line rightward, not merely the nearest thing within a
      // quarter-turn of rightward — see `ranking`. Without it, a sideways domino
      // covering the junction to its right sent the mark to the one diagonally
      // below instead, which is in the cone and nearer.
      ranking: "straightest",
      isExcluded: (index) => {
        if (isBlocked(index)) return true;
        const point = junctionAt(index);
        return point !== undefined && pointInBoxFootprint(placedBox, point[0], point[1]);
      },
    });
    if (step >= 0) setHoveredJunction(step);
  };

  /*
   * The arrow keys, bound while this tool has the canvas and the pointer is over
   * it — the same rule the layer keys follow, so that neither fires at whatever
   * else has the user's attention. Not while a drag is running: the pointer is
   * mid-gesture and the mark belongs to it.
   *
   * The dependency list is long because everything a placement needs is in it.
   * That is deliberate rather than unfortunate: the handler is rebuilt when the
   * mark moves to a different junction, which happens once per junction crossed
   * and not once per movement of the pointer.
   */
  useEffect(() => {
    if (!armed || modifying || !pointerOverCanvas || dragging) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const arrow = arrowDirectionForKey(e.key);
      if (!arrow) return;
      e.preventDefault();
      layTowardArrow(arrow, e.shiftKey);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    armed,
    modifying,
    pointerOverCanvas,
    dragging,
    hoveredJunction,
    junctions,
    blocked,
    boxes,
    camera,
    orientation,
    layer,
    floorZ,
    placeDomino,
  ]);

  /*
   * A grid may have no junctions at all — a spacing small enough to need more
   * dots than can usefully be drawn produces none, and that grid can be sitting
   * in the document with its sidebar row reddened. There is nowhere to place a
   * domino then, so the tool stands down rather than snapping to nothing.
   *
   * It also stands down while an operation's properties are open. The canvas
   * stays live above that dialog's scrim on purpose, so without this a drag
   * behind the dialog would place dominoes.
   *
   * And it stands down when the other tool is chosen, which is what keeps the two
   * pick planes from ever being in the scene together.
   */
  if (!armed || junctions.length === 0 || modifying) return null;

  const pointFor = (e: ThreeEvent<PointerEvent>) =>
    nearestJunctionIndex(junctions, e.point.x, e.point.y);

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    const nearest = pointFor(e);
    setHoveredJunction(nearest);
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Any other button belongs to the view controls; if one arrives mid-drag it
    // means a pan is starting, and a preview left turning under a moving camera
    // would be nonsense.
    if (e.button !== 0) {
      if (dragging) giveUp();
      return;
    }
    // What the press landed on, remembered in case it turns out not to be a
    // placement — see the release below.
    pressedRef.current = {
      domino: dominoUnderPointer(boxes, e),
      additive: e.ctrlKey || e.metaKey,
    };

    const nearest = pointFor(e);
    // Nothing can be started from a junction with a domino already standing on
    // it, so the press starts no drag. It is still a press that may select what
    // it landed on, which is why this happens after the line above and not
    // before it.
    if (nearest < 0 || isBlocked(nearest)) return;
    setAnchorJunction(nearest);
    setHoveredJunction(nearest);
    // Keeps the drag alive once the pointer leaves the plane — and, because of
    // how r3f handles that, freezes the aim back onto the starting junction, so
    // the preview goes and releasing out there places nothing. See captureTarget.
    captureTarget(e).setPointerCapture(e.pointerId);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const pressed = pressedRef.current;
    pressedRef.current = null;

    // Whether the pointer ended up somewhere other than where it started, which
    // is what tells a drag apart from a click.
    const aimedElsewhere = dragging && pointFor(e) !== anchorJunction;
    let placed = false;

    if (dragging) {
      captureTarget(e).releasePointerCapture(e.pointerId);
      const from = junctionAt(anchorJunction);
      const toward = junctionAt(pointFor(e));
      setAnchorJunction(-1);

      // Undefined when the two are the same junction — a press that never moved,
      // which is not a placement.
      const domino =
        from && toward ? dominoFromDrag(orientation, layer, from, toward) : undefined;
      // Tested again rather than trusting whether a preview was last drawn: a
      // release can arrive from a position no movement event reported.
      if (domino && !wouldOverlap(domino)) {
        placeDomino(domino);
        placed = true;
      }
    }

    /*
     * A press that never went anywhere is a click, and a click selects.
     *
     * That gesture was already doing nothing — a press with no direction places
     * nothing — so this takes it over rather than competing with anything. A drag
     * that aimed somewhere and was refused is deliberately *not* treated as a
     * click: the user asked for a domino, and quietly selecting something else
     * instead would be a surprise.
     *
     * Ctrl adds to the selection rather than replacing it, matching the Designer,
     * which is also why a Ctrl-click on empty space leaves the selection alone.
     */
    if (placed || aimedElsewhere || !pressed) return;
    if (pressed.domino >= 0) selectDominoes([pressed.domino], pressed.additive);
    else if (!pressed.additive) clearDominoSelection();
  };

  const anchorPoint = junctionAt(anchorJunction);
  const hoveredPoint = junctionAt(hoveredJunction);

  // While dragging, the mark follows the junction being aimed at rather than the
  // anchor — and goes out entirely when they are the same one, since there is
  // then no direction and nothing would be placed. A buried junction is never
  // marked, whether it is the one being aimed at or the one under an idle
  // pointer.
  const markedPoint =
    isBlocked(hoveredJunction) || (dragging && hoveredJunction === anchorJunction)
      ? undefined
      : hoveredPoint;

  const aimed =
    dragging && anchorPoint && hoveredPoint && hoveredJunction !== anchorJunction
      ? dominoFromDrag(orientation, layer, anchorPoint, hoveredPoint)
      : undefined;

  // Nothing is drawn for a domino that will not go there. The mark above stays,
  // so the direction is still readable while the pointer is moved to somewhere it
  // will fit.
  const preview = aimed && !wouldOverlap(aimed) ? aimed : undefined;

  return (
    <>
      <LayerPickPlane
        floorZ={floorZ}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        // Only when nothing is being dragged. The pointer is captured during a
        // drag, so a wander past the edge of the plane still belongs to the
        // gesture and must not blank the domino being placed.
        onPointerLeave={() => {
          if (!dragging) setHoveredJunction(-1);
        }}
      />

      {markedPoint && (
        <JunctionMark point={markedPoint} z={floorZ + JUNCTION_DOT_LIFT_MM} />
      )}

      {preview && <DominoPreview domino={preview} floorZ={floorZ} />}
    </>
  );
}

/**
 * The blue box around the junction being aimed at.
 *
 * **Drawn as a `<points>` object exactly like the junction dots themselves**,
 * with its size counted in screen pixels rather than millimetres. That is what
 * makes it a box around the dot at every zoom; a mark measured in millimetres
 * would be a speck when zoomed out and a slab when zoomed in, while the black
 * dot it is meant to surround stayed the same size throughout.
 *
 * It sits at exactly the same height as the dot it surrounds, so which of the
 * two shows cannot be settled by which is nearer the camera. `renderOrder` sorts
 * them instead — see JUNCTION_HIGHLIGHT_RENDER_ORDER, which explains why both
 * this and the dot have to be lifted *above* the rest of the scene rather than
 * this one being pushed below the dot.
 *
 * The depth flags are what keep it out of that comparison in the first place:
 * `depthTest` off so no domino standing in front can hide the junction being
 * aimed at, and `depthWrite` off so it does not hide the dot in turn.
 */
function JunctionMark({
  point,
  z,
}: {
  point: readonly [number, number];
  z: number;
}) {
  const pixelRatio = useThree((s) => s.gl.getPixelRatio());

  const geometry = useMemo(() => {
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array([point[0], point[1], z]), 3),
    );
    return buffer;
  }, [point, z]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} renderOrder={JUNCTION_HIGHLIGHT_RENDER_ORDER}>
      <pointsMaterial
        color={JUNCTION_HIGHLIGHT_COLOR}
        size={JUNCTION_HIGHLIGHT_SIZE_PX * pixelRatio}
        sizeAttenuation={false}
        depthTest={false}
        depthWrite={false}
      />
    </points>
  );
}

/**
 * The domino under the pointer, which is not part of the structure yet.
 *
 * One mesh and one set of edges rather than a place in the instanced batch: this
 * changes on every movement of the pointer, and putting it through the batch
 * would rebuild every placed domino's outline each time. It shares the batch's
 * geometry, so a domino is a box of size one stretched by a group around it, the
 * same way each copy in the batch is.
 */
function DominoPreview({
  domino,
  floorZ,
}: {
  domino: PlacedDomino;
  floorZ: number;
}) {
  const { centre, angleRad, extents } = placedDominoPlacement(domino, floorZ);

  return (
    <group
      position={[centre[0], centre[1], centre[2]]}
      rotation={[0, 0, angleRad]}
      scale={[extents[0], extents[1], extents[2]]}
    >
      <mesh geometry={UNIT_BOX} material={dominoPreviewFillMaterial} />
      <lineSegments geometry={UNIT_BOX_EDGES} material={dominoPreviewEdgeMaterial} />
    </group>
  );
}