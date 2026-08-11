import { useMemo } from "react";

import PolygonPreview from "../polygonPreview";
import type { ShapePreviewStyle } from "../preview";
import type { TriangleSelectState } from "./object-model";

/**
 * The triangle the gesture is currently describing, in parent-relative mm — its
 * caller (DominoEditor) wraps it in a <group> at the edited DDObject's origin,
 * so these coordinates land where DominoData.positions do.
 *
 * All of the drawing is PolygonPreview's; this only names the corners. During
 * the opening drag the third corner sits on the second, which that component
 * renders as the bare line the gesture is meant to show — see its comment on
 * degenerate polygons.
 */
export default function TriangleSelectPreview({
  state,
  previewStyle,
}: {
  state: TriangleSelectState;
  previewStyle: ShapePreviewStyle;
}) {
  // Memoized so PolygonPreview's own geometry memo, which is keyed on this
  // array, doesn't rebuild when nothing about the triangle has moved.
  const corners = useMemo(
    () => [
      { x: state.ax, y: state.ay },
      { x: state.bx, y: state.by },
      { x: state.cx, y: state.cy },
    ],
    [state.ax, state.ay, state.bx, state.by, state.cx, state.cy],
  );

  return <PolygonPreview points={corners} previewStyle={previewStyle} />;
}