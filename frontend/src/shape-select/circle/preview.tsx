import {
  PREVIEW_BORDER_ORDER,
  PREVIEW_BORDER_Z,
  PREVIEW_FILL_Z,
  PREVIEW_ORDER,
  UNIT_DISC,
  UNIT_RIM,
  type ShapePreviewStyle,
} from "../preview";
import { radiusSquared, type CircleSelectState } from "./object-model";

/**
 * The circle a drag is currently sweeping out, in parent-relative mm — its
 * caller (DominoEditor) wraps it in a <group> at the edited DDObject's
 * origin, so these coordinates land where DominoData.positions do.
 *
 * depthTest off, like the rectangle band, so it floats over the standing
 * dominoes rather than being buried among them.
 *
 * `previewStyle` decides the disc's colours: white while the drag is selecting,
 * dark while Alt is deselecting. Taken from the prop and never hard-coded, so
 * the circle always agrees with the rectangle band about what the colours mean.
 * It affects this disc only — the dominoes underneath keep their own outline
 * colours throughout.
 */
export default function CircleSelectPreview({
  state,
  previewStyle,
}: {
  state: CircleSelectState;
  previewStyle: ShapePreviewStyle;
}) {
  // The one square root in the whole variant: once per frame, rather than once
  // per domino as a centre/radius state shape would have forced.
  const r = Math.sqrt(radiusSquared(state));
  if (r <= 0) return null; // a click's zero-radius circle draws nothing

  return (
    <>
      <mesh
        geometry={UNIT_DISC}
        position={[state.cx, state.cy, PREVIEW_FILL_Z]}
        scale={[r, r, 1]}
        renderOrder={PREVIEW_ORDER}
      >
        <meshBasicMaterial
          color={previewStyle.fillColor}
          transparent
          opacity={previewStyle.fillOpacity}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <lineLoop
        geometry={UNIT_RIM}
        position={[state.cx, state.cy, PREVIEW_BORDER_Z]}
        scale={[r, r, 1]}
        renderOrder={PREVIEW_BORDER_ORDER}
      >
        <lineBasicMaterial color={previewStyle.borderColor} transparent depthTest={false} />
      </lineLoop>
    </>
  );
}