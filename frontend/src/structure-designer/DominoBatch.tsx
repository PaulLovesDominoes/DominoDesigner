import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  DOMINO_EDGE_RGB,
  DOMINO_SELECTED_EDGE_RGB,
  dominoEdgeMaterial,
  dominoFillMaterial,
  UNIT_BOX,
  UNIT_BOX_EDGES,
} from "./DominoMeshes";

/**
 * How many domino slots are reserved at a time. Big enough that a session spent
 * placing dominoes rebuilds the mesh rarely, small enough that a structure of
 * three pieces is not holding room for hundreds.
 */
const CAPACITY_BLOCK = 256;

/**
 * Above this many dominoes changing colour at once, the whole colour buffer is
 * sent to the graphics card rather than the changed pieces one at a time.
 *
 * Each changed piece is its own small upload, so a few of them cost almost
 * nothing and a few thousand cost more than sending everything once. The
 * crossover is nowhere near exact and does not need to be; what matters is that
 * neither end of the range is left doing the wrong one.
 */
const BULK_COLOR_UPDATE = 256;

/** How many corner points one domino's outline contributes. */
const pointsPerDomino = UNIT_BOX_EDGES.getAttribute("position").count;

/**
 * Draws any number of dominoes as two things rather than two per domino.
 *
 * A structure can run to tens of thousands of pieces, and a mesh apiece would be
 * that many separate instructions to the graphics card every time the view moved.
 * The two halves of a domino need different treatment to avoid that:
 *
 * - The **cream faces** go through an `InstancedMesh`. That is one shape plus a
 *   list of matrices — a matrix being the 4x4 table of numbers that says where
 *   one copy sits, how it is turned and how it is stretched. The card is handed
 *   the shape once and stamps a copy for each matrix, so however many dominoes
 *   there are it is one instruction.
 * - The **edges** cannot use the same trick, because three.js only instances
 *   triangles and these are lines. So they are merged instead: the unit box's
 *   twenty-four corner points are put through each domino's matrix here, on the
 *   processor, and the results concatenated into one long list of line segments
 *   that is also one instruction.
 *
 * The merge sounds expensive and is not, because of *when* it happens. The list
 * of dominoes changes when one is placed, deleted, or brought back by an undo —
 * a handful of times a minute — and never while the view is being dragged. The
 * Designer's dominoes/modeller.tsx faces the same problem and solves it the other
 * way, by patching a shader so lines can be instanced too; it needs to, because
 * its domino positions change under a paint stroke.
 *
 * ## Why the outline colour is not simply a second merged outline
 *
 * A selected domino is outlined white. The obvious way to draw that is two merged
 * outlines, one per colour — and it is wrong here, because the selection changes
 * *while a rubber band is being dragged*, and rebuilding a merged outline of tens
 * of thousands of dominoes on every frame of a drag is millions of numbers a
 * frame.
 *
 * So there is one outline, and the colour rides along in the geometry: a colour
 * per corner point, and a material told to read it from there. Positions are
 * rebuilt only when the dominoes themselves change; a change of selection rewrites
 * the colours of the pieces that changed and nothing else. A band moving over a
 * dense structure catches a handful more or fewer dominoes per frame, so the usual
 * frame writes a few hundred bytes.
 */
export default function DominoBatch({
  /** One matrix per domino: where it is, how it is turned, how big it is. */
  matrices,
  /** Which of them are selected, as positions in `matrices`. */
  selected,
}: {
  matrices: readonly THREE.Matrix4[];
  selected: ReadonlySet<number>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  /*
   * The canvas only draws a frame when something asks it to (StructureCanvas
   * sets frameloop="demand"). React-three-fiber asks by itself whenever a
   * property of something in the scene is changed through JSX, but both effects
   * below reach past that and write straight into a buffer — which nothing
   * watches. Without these calls a change of selection repainted no outlines
   * until some *other* thing happened to ask for a frame, so the white outline
   * only appeared once the pointer next moved.
   */
  const invalidate = useThree((s) => s.invalidate);

  /*
   * An InstancedMesh is allocated for a fixed number of copies when it is made,
   * so growing past that number means building a new one. Rounding the capacity
   * up in blocks means that happens once every few hundred placements rather
   * than on every single one; `count` below then limits how many of the reserved
   * slots are actually drawn, so the spare ones cost nothing.
   */
  const capacity = Math.max(
    CAPACITY_BLOCK,
    Math.ceil(matrices.length / CAPACITY_BLOCK) * CAPACITY_BLOCK,
  );

  /*
   * Writing the matrices in has to happen after react-three-fiber has put the
   * mesh into the scene and before the frame is drawn, which is what a layout
   * effect is for — an ordinary effect can run after a paint, and the first
   * frame would show every domino stacked at the origin.
   */
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]);
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    // Where the whole batch sits, so the renderer can tell at a glance whether
    // any of it is on screen. It has to be recomputed by hand because the
    // matrices are not something three.js watches.
    mesh.computeBoundingSphere();
    invalidate();
  }, [matrices, capacity, invalidate]);

  /*
   * The merged outline. Each domino contributes the unit box's edge points with
   * its own matrix applied — the same matrix the filled copy uses, so the lines
   * land exactly on the faces.
   *
   * The colours are allocated here alongside the positions but left at zero;
   * filling them in is the effect below, which has to run for a fresh geometry
   * as well as for a change of selection and would otherwise be written twice.
   */
  const edgeGeometry = useMemo(() => {
    const source = UNIT_BOX_EDGES.getAttribute("position");
    const merged = new Float32Array(matrices.length * pointsPerDomino * 3);
    const point = new THREE.Vector3();

    for (let i = 0; i < matrices.length; i++) {
      const matrix = matrices[i];
      const base = i * pointsPerDomino * 3;
      for (let p = 0; p < pointsPerDomino; p++) {
        point.fromBufferAttribute(source, p).applyMatrix4(matrix);
        merged[base + p * 3] = point.x;
        merged[base + p * 3 + 1] = point.y;
        merged[base + p * 3 + 2] = point.z;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(merged, 3));
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(merged.length), 3),
    );
    return geometry;
  }, [matrices]);

  /*
   * Which dominoes were white last time this ran, so that only the ones whose
   * answer changed have to be rewritten.
   *
   * A ref rather than state: nothing renders differently because of it, and it
   * has to be read and written inside the same effect that uses it.
   */
  const paintedRef = useRef<ReadonlySet<number>>(new Set());
  // A fresh geometry starts with every colour at zero, so nothing about it
  // matches what the ref remembers about the old one. This says so.
  const paintedGeometryRef = useRef<THREE.BufferGeometry | null>(null);

  useLayoutEffect(() => {
    const colors = edgeGeometry.getAttribute("color") as THREE.BufferAttribute;
    const values = colors.array as Float32Array;
    const fresh = paintedGeometryRef.current !== edgeGeometry;
    const painted = paintedRef.current;

    /** Write one domino's whole outline in the colour its state calls for. */
    const paint = (domino: number) => {
      const rgb = selected.has(domino) ? DOMINO_SELECTED_EDGE_RGB : DOMINO_EDGE_RGB;
      const base = domino * pointsPerDomino * 3;
      for (let p = 0; p < pointsPerDomino; p++) {
        values[base + p * 3] = rgb[0];
        values[base + p * 3 + 1] = rgb[1];
        values[base + p * 3 + 2] = rgb[2];
      }
    };

    /*
     * Whether to send the whole buffer or only the stretches that moved.
     *
     * three.js sends everything when a buffer is flagged with no ranges attached,
     * and only the ranges when there are some. So a whole-buffer send has to
     * clear any that are hanging about: three.js clears them itself once it has
     * used them, but a change made on a frame that was never drawn leaves them
     * behind, and they would then be honoured in place of the full send.
     */
    const sendEverything = () => {
      colors.clearUpdateRanges();
      colors.needsUpdate = true;
    };

    // Whether anything was actually rewritten, so a run that found the outlines
    // already the right colours does not ask for a frame that would redraw the
    // scene exactly as it already is.
    let wrote = false;

    if (fresh) {
      for (let i = 0; i < matrices.length; i++) paint(i);
      sendEverything();
      wrote = true;
    } else {
      // The dominoes whose answer changed: newly selected, or no longer so.
      const changed: number[] = [];
      for (const domino of selected) if (!painted.has(domino)) changed.push(domino);
      for (const domino of painted) if (!selected.has(domino)) changed.push(domino);

      if (changed.length > 0) {
        for (const domino of changed) {
          if (domino >= 0 && domino < matrices.length) paint(domino);
        }

        if (changed.length > BULK_COLOR_UPDATE) {
          sendEverything();
        } else {
          for (const domino of changed) {
            if (domino < 0 || domino >= matrices.length) continue;
            colors.addUpdateRange(domino * pointsPerDomino * 3, pointsPerDomino * 3);
          }
          colors.needsUpdate = true;
        }
        wrote = true;
      }
    }

    paintedRef.current = selected;
    paintedGeometryRef.current = edgeGeometry;
    if (wrote) invalidate();
  }, [edgeGeometry, selected, matrices, invalidate]);

  // React-three-fiber frees a geometry when the object holding it leaves the
  // scene, but not when one is swapped for another while it stays — which is
  // every placement. Without this the old arrays would pile up on the card.
  useEffect(() => () => edgeGeometry.dispose(), [edgeGeometry]);

  if (matrices.length === 0) return null;

  return (
    <>
      {/*
        Keyed on the capacity so that outgrowing it builds a fresh mesh rather
        than trying to widen one that cannot be widened.
      */}
      <instancedMesh
        key={capacity}
        ref={meshRef}
        args={[UNIT_BOX, dominoFillMaterial, capacity]}
      />
      <lineSegments geometry={edgeGeometry} material={dominoEdgeMaterial} />
    </>
  );
}