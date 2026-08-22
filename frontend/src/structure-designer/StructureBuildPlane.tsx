import {
  STRUCTURE_PLANE_COLOR,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "./constants";

/**
 * The flat surface a structure is built on. Fixed in size and colour — unlike
 * the Designer's build plane there is no DDObject behind it, because there is
 * nothing here for the user to select, move, resize or recolour.
 *
 * A <mesh> is one drawn thing in the three.js scene: a shape (the
 * planeGeometry) plus a material saying how to colour it. planeGeometry is
 * centred on its own origin, hence the half-width/half-height offset that puts
 * the plane's lower-left corner at (0, 0). meshBasicMaterial ignores lighting
 * and paints its colour flat, which is what the whole app does.
 */
export default function StructureBuildPlane() {
  return (
    <mesh
      position={[STRUCTURE_PLANE_WIDTH_MM / 2, STRUCTURE_PLANE_HEIGHT_MM / 2, 0]}
    >
      <planeGeometry args={[STRUCTURE_PLANE_WIDTH_MM, STRUCTURE_PLANE_HEIGHT_MM]} />
      <meshBasicMaterial
        color={STRUCTURE_PLANE_COLOR}
        // Layer 1's grey sheet sits at z = 0, exactly where this plane is. Two
        // surfaces at the same depth give the GPU the same number to compare,
        // so the depth test ties, and which one survives a tie comes down to
        // draw order and to rounding that differs from pixel to pixel — the
        // shimmering mottle known as z-fighting.
        //
        // polygonOffset breaks the tie by biasing this plane's depth *in the
        // depth buffer's own units*, away from the camera, with a slope-scaled
        // part (the factor) that grows as the surface turns away from the
        // viewer. That last part is why it is the right fix here and a plain
        // nudge in +Z is not: a fixed nudge only separates the two while the
        // camera looks straight down at them, and this screen exists to be
        // tilted. Tilt far enough and only the part of the nudge that lies
        // along the view direction still separates them, which shrinks to
        // nothing at a grazing angle.
        //
        // Applied always, not only at layer 1: nothing else in this scene lies
        // in this plane, so at every other layer the bias changes nothing that
        // can be seen, and a condition would only be one more thing to get
        // wrong later.
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
      />
    </mesh>
  );
}