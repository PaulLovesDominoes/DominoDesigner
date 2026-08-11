import { useMemo } from "react";

import PolygonPreview from "../polygonPreview";
import type { ShapePreviewStyle } from "../preview";
import { rectangleCorners, type AngledRectangleSelectState } from "./object-model";

/**
 * The angled rectangle the gesture is currently describing, in parent-relative
 * mm — its caller (DominoEditor) wraps it in a <group> at the edited
 * DDObject's origin, so these coordinates land where DominoData.positions do.
 *
 * The corners come from rectangleCorners, the same function controlPoints uses,
 * so the drawn shape and the shape being measured can never disagree. While the
 * width is still zero the four corners collapse to two, which PolygonPreview
 * renders as the bare line the opening drag is meant to show.
 */
export default function AngledRectangleSelectPreview({
  state,
  previewStyle,
}: {
  state: AngledRectangleSelectState;
  previewStyle: ShapePreviewStyle;
}) {
  // Memoized so PolygonPreview's geometry memo, keyed on this array, doesn't
  // rebuild when nothing about the rectangle has moved.
  const corners = useMemo(() => rectangleCorners(state), [state]);

  return <PolygonPreview points={corners} previewStyle={previewStyle} />;
}