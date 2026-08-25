import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  JUNCTION_DOT_COLOR,
  JUNCTION_DOT_LIFT_MM,
  JUNCTION_DOT_SIZE_PX,
} from "./constants";

/**
 * A dot at every junction of a grid, drawn at one layer's height.
 *
 * Two things draw these and they have to look identical: the grid on the layer
 * being worked on, and the preview a grid definition shows while its properties
 * are open. Keeping one component means a change to how a dot is drawn cannot
 * land on one of them and not the other — the same reason LayerSheets exists.
 *
 * **Drawn as a three.js `<points>` object**, which is one drawn thing holding a
 * whole cloud of positions: the GPU is handed the list once and puts a small
 * square on the screen for each entry. A grid can hold thousands of junctions,
 * and a separate little mesh for each would be thousands of separate pieces of
 * work per frame instead of one.
 */
export default function JunctionDots({
  /** Junction positions on the build plane as a flat run of x, y, x, y, … in mm. */
  points,
  /** How far off the build plane to draw them, in mm. */
  z,
}: {
  points: Float32Array;
  z: number;
}) {
  // The size below is counted in the canvas's own pixels, and on a
  // high-resolution display there are more of those per pixel the page measures
  // in — two of them each way is common. Left unscaled, the same dot would come
  // out half as wide on such a screen as on an ordinary one.
  const pixelRatio = useThree((s) => s.gl.getPixelRatio());

  /*
   * A BufferGeometry is the object holding a drawn thing's raw arrays of numbers
   * in the form the GPU wants them. The positions arrive here flat and
   * two-dimensional, so they are widened to the x, y, z triples three.js
   * expects, with every z left at zero — the whole cloud is then lifted to the
   * layer's height by the <points> object's own position below, which is what
   * lets the layer slider move the dots without any of this being rebuilt.
   *
   * A BufferAttribute is one such array plus how many numbers make up one entry
   * — three, here, for x, y and z.
   */
  const geometry = useMemo(() => {
    const positions = new Float32Array((points.length / 2) * 3);
    for (let i = 0; i < points.length / 2; i++) {
      positions[i * 3] = points[i * 2];
      positions[i * 3 + 1] = points[i * 2 + 1];
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return buffer;
  }, [points]);

  // React-three-fiber frees a geometry when the object holding it leaves the
  // scene, but not when one is swapped for another while it stays — which is
  // every keystroke in the properties dialog. Without this the old arrays would
  // pile up on the graphics card.
  useEffect(() => () => geometry.dispose(), [geometry]);

  if (points.length === 0) return null;

  return (
    <points geometry={geometry} position={[0, 0, z + JUNCTION_DOT_LIFT_MM]}>
      {/*
        sizeAttenuation is whether a point shrinks as it gets further away. Off,
        `size` is a count of screen pixels instead of millimetres, so a dot stays
        the same small mark however far the view is zoomed in or out — which is
        what makes a junction read as a point rather than growing into a blob.
      */}
      <pointsMaterial
        color={JUNCTION_DOT_COLOR}
        size={JUNCTION_DOT_SIZE_PX * pixelRatio}
        sizeAttenuation={false}
      />
    </points>
  );
}