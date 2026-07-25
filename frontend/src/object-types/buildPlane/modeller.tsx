import type { DDObjectModellerProps } from "../base";
import type { BuildPlaneDDObject } from "./object-model";

/**
 * The flat build surface. Driven by its DDObject's width/height/color, so edits
 * in the properties dialog appear as they are typed. 1 unit = 1 mm; the plane's
 * origin is its lower-left corner.
 */
export default function BuildPlaneModeller({
  ddObject: { width, height, color },
}: DDObjectModellerProps<BuildPlaneDDObject>) {
  return (
    <mesh position={[width / 2, height / 2, 0]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color={color} />
    </mesh>
  );
}
