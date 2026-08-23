import LayerSheets from "./LayerSheets";
import { layerFloors } from "./operation-types/layerDefinition/layers";
import { useLayerHeights } from "./operation-types/layerDefinition/useLayerHeights";
import { useStructureStore } from "./store";

/**
 * Every layer of the structure at once, drawn as faint sheets — the toolbar's
 * Show All Layers toggle.
 *
 * It shows the whole stack the layer definitions describe, including the layers
 * above them that fall back to the standard height, so the toggle always draws
 * the full structure rather than only the part that has been defined. The
 * ordinary layer sheet keeps working alongside it: the layer being worked on
 * stays the solid one, and these are the faint context around it.
 *
 * **Nothing is drawn while an operation's properties are open.** That operation's
 * own preview is on screen then, and it draws sheets at the same heights with
 * the same material — two sets on top of each other would add up, so the layers
 * being edited would come out looking denser than the rest for no reason the
 * user could name. Same rule, and the same reason, as LayerPlane's.
 */
export default function AllLayersView() {
  const showAllLayers = useStructureStore((s) => s.showAllLayers);
  const modifying = useStructureStore((s) => s.modifyingOperationId !== null);
  const heights = useLayerHeights();

  if (!showAllLayers || modifying) return null;

  // One sheet per layer, at its floor — the topmost being the top layer's floor,
  // which is exactly where the slider's own sheet sits at its highest position.
  // See layerFloors for why the top layer's ceiling is not among them.
  return <LayerSheets heights={layerFloors(heights)} />;
}