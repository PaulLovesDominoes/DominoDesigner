import * as THREE from "three";

import {
  LAYER_PLANE_COLOR,
  LAYER_PREVIEW_OPACITY,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "./constants";

/**
 * A faint sheet at each of the given heights, in mm above the build plane.
 *
 * Two things draw these and they have to look identical: the Show All Layers
 * view, and the preview a layer definition shows while its properties are open.
 * Keeping one component means a change to how a sheet is drawn cannot land on
 * one of them and not the other.
 *
 * Much fainter than the single layer sheet at the layer being worked on, because
 * there may be a hundred of these stacked up the screen and at that opacity the
 * ones behind would add up into a solid wall.
 */
export default function LayerSheets({ heights }: { heights: readonly number[] }) {
  return (
    <>
      {heights
        // Layer 1's floor is the build plane itself, so a sheet there would only
        // fight with it for the same pixels. Filtered on the height rather than
        // on being the first sheet, because the height is what the rule is
        // actually about.
        .filter((z) => z > 0)
        .map((z, index) => (
          <mesh
            // Keyed by position rather than by height: two sheets can sit at the
            // same height while a row is being typed into, and duplicate keys
            // would make React drop one of them.
            key={index}
            position={[
              STRUCTURE_PLANE_WIDTH_MM / 2,
              STRUCTURE_PLANE_HEIGHT_MM / 2,
              z,
            ]}
          >
            <planeGeometry
              args={[STRUCTURE_PLANE_WIDTH_MM, STRUCTURE_PLANE_HEIGHT_MM]}
            />
            {/*
              The same three settings as the ordinary layer sheet, for the same
              reasons: a see-through surface must not record its own depth, or
              things drawn after it would be hidden behind something you can see
              through; and a plane faces one way by default, so it is drawn from
              both sides to stop it blinking out at a near-horizontal tilt.

              Showing every layer draws about a hundred of these. That is
              comfortable for a scene this empty — but it is the first place to
              look if the view ever feels sluggish.
            */}
            <meshBasicMaterial
              color={LAYER_PLANE_COLOR}
              transparent
              opacity={LAYER_PREVIEW_OPACITY}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
    </>
  );
}