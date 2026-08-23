import LayerSheets from "../../LayerSheets";
import type { StructureOperationPreviewProps } from "../base";
import { definitionLayerHeights, LAYER_COUNT, layerHeights } from "./layers";
import type { LayerDefinitionOperation } from "./object-model";

/**
 * The sheets shown while a layer definition's properties are open: one at the
 * floor of its first layer, and one more at every layer boundary it goes on to
 * describe. Seeing where the layers land is the whole point of the dialog being
 * modeless.
 *
 * The ordinary layer sheet is hidden while this is on screen, and so is the Show
 * All Layers view — both of those rules live in the components that draw them,
 * since it is their business whether to draw.
 *
 * Every sheet moves as the properties are typed, and none of that needs an
 * explicit repaint request even though the canvas only redraws on demand. This
 * component lives inside the <Canvas>, so a store write re-renders it, R3F
 * applies the change to the scene, and the renderer paints. The `invalidate()`
 * calls elsewhere in this folder are all for changes made straight to three.js
 * objects, outside React's rendering. The one thing to keep: work the heights
 * out *here*, inside the canvas. Computing them outside and handing the answer
 * in through something React does not track is how this would quietly stop
 * repainting.
 */
export default function LayerDefinitionPreview({
  operation,
  operations,
}: StructureOperationPreviewProps<LayerDefinitionOperation>) {
  // Everything underneath this definition: how many layers come first, and —
  // as its total — how far off the build plane its own first layer starts.
  const below = layerHeights(operations, operation.id);
  const startZ = below.reduce((total, height) => total + height, 0);
  const mine = definitionLayerHeights(operation, LAYER_COUNT - below.length);

  // The floor of its first layer, then the top of each layer in turn — so a
  // definition of n layers draws n + 1 sheets. For a definition after the first
  // that opening sheet is exactly where the previous one finished, which is what
  // was wanted, and it falls out rather than being a special case.
  const boundaries: number[] = [startZ];
  for (const height of mine) boundaries.push(boundaries[boundaries.length - 1] + height);

  // That closing sheet is only a real boundary while some layer starts there. A
  // definition reaching the top of the structure has no layer above it, so its
  // last layer's ceiling would sit higher than the layer slider can ever reach
  // and read as one layer too many — the same rule layerFloors keeps.
  if (below.length + mine.length >= LAYER_COUNT) boundaries.pop();

  return <LayerSheets heights={boundaries} />;
}