import { useStore } from "../store";
import { useImageAssetStore } from "./assetStore";
import { imageLayerZ, imageOriginFor } from "./object-model";

/**
 * Draws the picture laid over the element being domino-edited.
 *
 * Mounted unconditionally in DesignerCanvas and arms itself, the same discipline
 * SelectionTool, CreateByRegionTool and DominoEditor follow. Deliberately not
 * rendered from Scene.tsx or from an element type's own modeller: an image
 * belongs to no element type in particular, and its rectangle is free to hang
 * off the element and off the build plane, which a type's modeller has no
 * business drawing.
 *
 * The <group> is a three.js node that applies its position to everything nested
 * inside it. Putting one at the element's domino layout anchor is the whole of
 * the conversion between the anchor-relative mm the record stores and the world
 * the scene is drawn in — done once here, and once more in ImageTransformTool,
 * from the same helper, so the picture drawn and the picture dragged are the
 * same rectangle.
 *
 * **The picture draws throughout domino editing mode, not only while colours are
 * being mapped.** It used to be tied to image mapping mode, which made its best
 * use impossible: a picture is tracing paper, and tracing it with the shape and
 * brush tools needs those tools, which that mode switches off. So there is no
 * imageMapActive test here — only "is this element being edited, and does it
 * have a picture it is currently showing".
 */
export default function ImageMapModeller() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  // The store's own stable references, not computed objects, so no useShallow.
  const image = useStore((s) => (s.dominoEditingId ? s.imageMaps[s.dominoEditingId] : undefined));
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));
  // Keyed by the picture rather than by the element — see assetStore.ts for why
  // that distinction is what makes undoing a replacement possible.
  const asset = useImageAssetStore((s) => (image ? s.assets[image.assetId] : undefined));

  if (!dominoEditingId || !image || !image.visible || !ddObject || !asset) {
    return null;
  }
  const origin = imageOriginFor(ddObject);
  if (!origin) return null;

  return (
    <group position={[origin.x, origin.y, 0]}>
      {/* planeGeometry is centred on its own origin, so the position is the
          rectangle's middle rather than its corner. */}
      <mesh
        position={[image.x + image.width / 2, image.y + image.height / 2, imageLayerZ(image.layer)]}
      >
        <planeGeometry args={[image.width, image.height]} />
        {/* depthWrite off is the usual rule for anything see-through: it still
            *tests* against what opaque geometry already wrote, which is exactly
            what makes the "below" layer work — a painted domino's full-height
            top is nearer the camera than the picture and so hides it, while a
            squashed unpainted one is further away and does not. Writing depth
            as well would make the picture hide whatever transparent thing came
            after it, which is never what is wanted. */}
        <meshBasicMaterial
          map={asset.texture}
          transparent
          opacity={image.opacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}