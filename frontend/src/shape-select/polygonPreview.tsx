import { useEffect, useMemo } from "react";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";

import type { ShapePoint } from "./base";
import {
  PREVIEW_BORDER_ORDER,
  PREVIEW_BORDER_Z,
  PREVIEW_FILL_Z,
  PREVIEW_ORDER,
  type ShapePreviewStyle,
} from "./preview";

/**
 * Draws any convex polygon as a filled region with an outline, in the
 * parent-relative mm every shape variant works in.
 *
 * Shared by the shapes that aren't round — triangle passes three corners,
 * angled rectangle four — the same "one answer every consumer reads" role
 * UNIT_DISC and UNIT_RIM play for circle and oval. Neither of those helps here,
 * since no scaling of a disc produces a triangle.
 *
 * **Degenerate polygons are expected, not an error case.** Both shapes using
 * this spend their opening stage with two of their points on top of each other
 * — the triangle's third corner still sitting on its second, the rectangle's
 * width still zero. A polygon with no area fills nothing, and the outline
 * collapses to the single line the user is dragging out, which is exactly the
 * intended behaviour for that stage. So neither variant needs a stage check in
 * its preview. Don't add guards for a case the geometry already handles.
 */
export default function PolygonPreview({
  points,
  previewStyle,
}: {
  points: readonly ShapePoint[];
  previewStyle: ShapePreviewStyle;
}) {
  // Rebuilt whenever a point moves, which is once per frame during a drag. That
  // is fine at three or four vertices and deliberately unlike circle's shared
  // UNIT_DISC, which is 64 segments and would be wasteful to rebuild per frame.
  // Disposed on replacement: a BufferGeometry holds a GPU buffer that the
  // browser will not reclaim on its own.
  const fillGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    for (const point of points) positions.push(point.x, point.y, 0);
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    // A triangle fan: every triangle shares the first point, so points 0,1,2
    // then 0,2,3 and so on fill any convex shape. Both shapes here are convex.
    const indices: number[] = [];
    for (let i = 1; i + 1 < points.length; i++) indices.push(0, i, i + 1);
    geometry.setIndex(indices);
    return geometry;
  }, [points]);
  useEffect(() => () => fillGeometry.dispose(), [fillGeometry]);

  const outlineGeometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const positions: number[] = [];
    for (const point of points) positions.push(point.x, point.y, 0);
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return geometry;
  }, [points]);
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry]);

  return (
    <>
      <mesh geometry={fillGeometry} position={[0, 0, PREVIEW_FILL_Z]} renderOrder={PREVIEW_ORDER}>
        <meshBasicMaterial
          color={previewStyle.fillColor}
          transparent
          opacity={previewStyle.fillOpacity}
          depthTest={false}
          depthWrite={false}
          // The order a polygon's corners are listed in decides which of its two
          // faces the GPU calls the front, and by default only the front is
          // drawn. Dragging the triangle's third corner across the line of the
          // first two reverses that order, so without DoubleSide the fill would
          // silently vanish for half the triangles a user can draw. Circle and
          // oval never hit this because CircleGeometry always lists its points
          // the same way round.
          side={DoubleSide}
        />
      </mesh>
      <lineLoop
        geometry={outlineGeometry}
        position={[0, 0, PREVIEW_BORDER_Z]}
        renderOrder={PREVIEW_BORDER_ORDER}
      >
        <lineBasicMaterial color={previewStyle.borderColor} transparent depthTest={false} />
      </lineLoop>
    </>
  );
}