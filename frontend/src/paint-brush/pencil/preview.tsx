import {
  PREVIEW_BORDER_ORDER,
  PREVIEW_BORDER_Z,
  PREVIEW_FILL_Z,
  PREVIEW_ORDER,
  SELECT_PREVIEW_STYLE,
  UNIT_DISC,
  UNIT_RIM,
} from "../../shape-select/preview";

/**
 * The pencil's round nib, drawn at the origin — DominoEditor puts it under the
 * cursor.
 *
 * UNIT_DISC and UNIT_RIM are a radius-1 disc and matching ring built once for
 * the whole app and scaled per use; they live in shape-select/preview.ts because
 * circle and oval select already share them, and a second round shape scaling
 * the same two is exactly what they are there for.
 *
 * The outline is drawn only mid-stroke. While hovering, the fill alone says
 * "this is what you would paint" without claiming anything is happening yet.
 */
export default function PencilBrushPreview({
  sizeMm,
  outlined,
}: {
  sizeMm: number;
  outlined: boolean;
}) {
  const radius = sizeMm / 2;

  return (
    <>
      <mesh
        geometry={UNIT_DISC}
        position={[0, 0, PREVIEW_FILL_Z]}
        scale={[radius, radius, 1]}
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
        <lineLoop
          geometry={UNIT_RIM}
          position={[0, 0, PREVIEW_BORDER_Z]}
          scale={[radius, radius, 1]}
          renderOrder={PREVIEW_BORDER_ORDER}
        >
          <lineBasicMaterial
            color={SELECT_PREVIEW_STYLE.borderColor}
            transparent
            depthTest={false}
          />
        </lineLoop>
      )}
    </>
  );
}