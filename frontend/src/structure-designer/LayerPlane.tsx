import * as THREE from "three";

import {
  LAYER_PLANE_COLOR,
  LAYER_PLANE_OPACITY,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "./constants";
// Reaching into one operation type's folder from the screen's own chrome. Taken
// deliberately: only layer definitions decide how tall a layer is and only they
// ever will, so routing this back through the registry would be an abstraction
// with a single implementation dispatching to itself. See layers.ts.
import { layerFloorMm } from "./operation-types/layerDefinition/layers";
import { useLayerHeights } from "./operation-types/layerDefinition/useLayerHeights";
import { useStructureStore } from "./store";
import { usePreviewDrawsLayerSheets } from "./usePreviewDrawsLayerSheets";

/**
 * The grey sheet showing which layer is being worked on. It sits at the layer's
 * floor — layer 1 lies on the build plane itself, and each layer above it is as
 * far up in +Z as the layers below it are tall.
 *
 * Those heights come from the layer definitions, so changing one moves this
 * sheet: that is what makes a saved definition something you can see rather
 * than something you have to take on trust. With no definitions at all every
 * layer takes the standard height and the sheet steps exactly as it always did.
 *
 * Semi-transparent rather than solid, because at layer 1 it covers the build
 * plane exactly, and a solid sheet would hide the light grey-blue surface that
 * says which screen this is — in the screen's own starting state. Letting the
 * plane read through solves that without needing a special case for layer 1.
 */
export default function LayerPlane() {
  const layer = useStructureStore((s) => s.layer);
  const previewDrawsSheets = usePreviewDrawsLayerSheets();
  const heights = useLayerHeights();

  // While an operation whose preview draws sheets of its own is being edited,
  // that preview stands in for this one. Both drawn at once would sit at the
  // same heights and read as a single washed-out surface.
  //
  // Asked of the type rather than of whether *any* dialog is open, because not
  // every preview replaces this sheet — a grid definition's dots need it left
  // where it is or they float over nothing. The rule lives here rather than as a
  // branch in StructureCanvas, so the next previewing type is not a change to
  // that file.
  if (previewDrawsSheets) return null;

  const z = layerFloorMm(heights, layer);

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