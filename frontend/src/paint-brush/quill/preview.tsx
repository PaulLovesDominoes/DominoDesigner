import { EdgesGeometry, PlaneGeometry } from "three";

import {
  PREVIEW_BORDER_ORDER,
  PREVIEW_BORDER_Z,
  PREVIEW_FILL_Z,
  PREVIEW_ORDER,
  SELECT_PREVIEW_STYLE,
} from "../../shape-select/preview";
import { QUILL_NIB_ANGLE, QUILL_NIB_WIDTH_MM } from "./object-model";

/**
 * A 1x1 square and its four edges, built once for the app and scaled per use —
 * the same reasoning as UNIT_DISC/UNIT_RIM next door in shape-select/preview.ts.
 * EdgesGeometry drops the square's internal diagonal (the seam between the two
 * triangles a plane is made of) because the two triangles are coplanar, leaving
 * just the outline.
 */
const UNIT_NIB = new PlaneGeometry(1, 1);
const UNIT_NIB_EDGES = new EdgesGeometry(UNIT_NIB);

/**
 * The quill's nib, drawn at the origin — DominoEditor puts it under the cursor.
 *
 * Deliberately not shape-select's PolygonPreview: that always draws its
 * lineLoop, and a hovering brush has to show the fill with no outline at all.
 *
 * A <mesh>'s `rotation` is applied after its `scale` and before its `position`,
 * so scaling the unit square to the nib's length-by-width and then turning it 45
 * degrees puts its long axis on the lower-left/upper-right diagonal, which is
 * where `contains` expects it.
 */
export default function QuillBrushPreview({
  sizeMm,
  outlined,
}: {
  sizeMm: number;
  outlined: boolean;
}) {
  const scale: [number, number, number] = [sizeMm, QUILL_NIB_WIDTH_MM, 1];

  return (
    <>
      <mesh
        geometry={UNIT_NIB}
        position={[0, 0, PREVIEW_FILL_Z]}
        rotation={[0, 0, QUILL_NIB_ANGLE]}
        scale={scale}
        renderOrder={PREVIEW_ORDER}
      >
        <meshBasicMaterial
          color={SELECT_PREVIEW_STYLE.fillColor}
          transparent
          opacity={SELECT_PREVIEW_STYLE.fillOpacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {outlined && (
        <lineSegments
          geometry={UNIT_NIB_EDGES}
          position={[0, 0, PREVIEW_BORDER_Z]}
          rotation={[0, 0, QUILL_NIB_ANGLE]}
          scale={scale}
          renderOrder={PREVIEW_BORDER_ORDER}
        >
          <lineBasicMaterial
            color={SELECT_PREVIEW_STYLE.borderColor}
            transparent
            depthTest={false}
          />
        </lineSegments>
      )}
    </>
  );
}