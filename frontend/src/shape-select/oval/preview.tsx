import {
  PREVIEW_BORDER_ORDER,
  PREVIEW_BORDER_Z,
  PREVIEW_FILL_Z,
  PREVIEW_ORDER,
  UNIT_DISC,
  UNIT_RIM,
  type ShapePreviewStyle,
} from "../preview";
import type { OvalSelectState } from "./object-model";

/**
 * The oval the gesture is currently describing, in parent-relative mm — its
 * caller (DominoEditTool) wraps it in a <group> at the edited DDObject's
 * origin, so these coordinates land where DominoData.positions do.
 *
 * The oval is the shared unit disc squashed and turned. three.js applies a
 * node's scale before its rotation, so scaling x and y by different amounts and
 * then rotating gives an ellipse lying at that angle — where doing it the other
 * way round would stretch the already-turned circle along the screen's axes and
 * come out wrong.
 *
 * depthTest off, like circle and the rectangle band, so it floats over the
 * standing dominoes rather than being buried among them. `previewStyle` decides
 * the colours: white while the gesture is selecting, dark while Alt is
 * deselecting. It affects this oval only — the dominoes underneath keep their
 * own outline colours throughout.
 */
export default function OvalSelectPreview({
  state,
  previewStyle,
}: {
  state: OvalSelectState;
  previewStyle: ShapePreviewStyle;
}) {
  if (state.semiMajor <= 0 || state.semiMinor <= 0) return null; // nothing to draw yet

  // The state carries the oval's direction as a unit vector because that is
  // what its containment test wants; three.js wants an angle. Converting here
  // costs one atan2 per frame rather than one per domino.
  const rotation = Math.atan2(state.axisSin, state.axisCos);

  return (
    <>
      <mesh
        geometry={UNIT_DISC}
        position={[state.centerX, state.centerY, PREVIEW_FILL_Z]}
        rotation={[0, 0, rotation]}
        scale={[state.semiMajor, state.semiMinor, 1]}
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
        position={[state.centerX, state.centerY, PREVIEW_BORDER_Z]}
        rotation={[0, 0, rotation]}
        scale={[state.semiMajor, state.semiMinor, 1]}
        renderOrder={PREVIEW_BORDER_ORDER}
      >
        <lineBasicMaterial color={previewStyle.borderColor} transparent depthTest={false} />
      </lineLoop>
    </>
  );
}