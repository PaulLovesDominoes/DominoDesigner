import * as THREE from "three";

import {
  DEFAULT_LAYER_HEIGHT_MM,
  LAYER_PLANE_COLOR,
  LAYER_PLANE_OPACITY,
  MIN_LAYER,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "./constants";
import { useStructureStore } from "./store";

/**
 * The grey sheet showing which layer is being worked on. It sits at the layer's
 * floor — layer 1 lies on the build plane itself, and each layer above it is
 * one layer height further up in +Z.
 *
 * Semi-transparent rather than solid, because at layer 1 it covers the build
 * plane exactly, and a solid sheet would hide the light grey-blue surface that
 * says which screen this is — in the screen's own starting state. Letting the
 * plane read through solves that without needing a special case for layer 1.
 */
export default function LayerPlane() {
  const layer = useStructureStore((s) => s.layer);
  const z = (layer - MIN_LAYER) * DEFAULT_LAYER_HEIGHT_MM;

  return (
    <mesh
      position={[STRUCTURE_PLANE_WIDTH_MM / 2, STRUCTURE_PLANE_HEIGHT_MM / 2, z]}
    >
      <planeGeometry args={[STRUCTURE_PLANE_WIDTH_MM, STRUCTURE_PLANE_HEIGHT_MM]} />
      <meshBasicMaterial
        color={LAYER_PLANE_COLOR}
        transparent
        opacity={LAYER_PLANE_OPACITY}
        // A see-through surface must not record its own depth, or things drawn
        // after it would be hidden behind something you can see through.
        depthWrite={false}
        // A plane faces one way by default, and is invisible from behind. The
        // camera is kept above the build plane, so front-facing would nearly
        // always do — but at a near-horizontal tilt "nearly" is where a sheet
        // would blink out, so it is drawn from both sides.
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}