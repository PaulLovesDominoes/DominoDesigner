import { NewLayerDefinitionIcon } from "../../../icons";
import type { StructureOperationBase, StructureOperationDefinition } from "../base";
import LayerDefinitionEditor from "./editor";
import { layerDefinitionWarning } from "./layers";
import LayerDefinitionPreview from "./preview";

/**
 * A run of layers, each given a height.
 *
 * Layer definitions stack: the first one describes the layers from layer 1
 * upward, the next carries on where it left off, and any layer no definition
 * reaches keeps the standard spacing. The arithmetic that does that stacking is
 * in layers.ts; this file is the shape of the data and the registry entry.
 *
 * Every field here is a string, a number, or an array of those. That is on
 * purpose: a structure's description is eventually written out as JSON for the
 * Designer to read, and this is already the shape it will be written in.
 */

/**
 * Where a layer's height comes from. The first three are a domino's own
 * dimensions — the usual answers, since a layer is normally one course of
 * dominoes lying or standing some way up. "custom" is a number the user typed.
 */
export type LayerHeightKind = "width" | "length" | "thickness" | "custom";

/** One row of the Layer Heights list. `mm` is read only when kind is "custom". */
export interface LayerHeightRow {
  kind: LayerHeightKind;
  mm: number;
}

export type LayerRepeatKind = "once" | "forever" | "count";

export interface LayerDefinitionOperation extends StructureOperationBase {
  type: "layerDefinition";
  /** The layers this defines, bottom first, before any repeating. */
  heights: LayerHeightRow[];
  repeat: LayerRepeatKind;
  /**
   * How many times the whole list runs, read only when `repeat` is "count".
   * Kept when the mode is switched away and back, so flipping to Forever to
   * see what it looks like doesn't lose the number that was typed.
   */
  repeatCount: number;
}

export const layerDefinitionDefinition: StructureOperationDefinition<LayerDefinitionOperation> =
  {
    type: "layerDefinition",
    icon: NewLayerDefinitionIcon,
    defaultName: "Layer Definition",
    toolbarLabel: "New Layer Definition",
    create: (id) => ({
      id,
      name: "Layer Definition",
      type: "layerDefinition",
      // Starts with nothing. The editor always draws one blank row below the
      // real ones, so an empty list still shows somewhere to begin.
      heights: [],
      repeat: "once",
      // Two rather than one, because Count = 1 is exactly what Once already
      // means — landing there on switching to Count would look like nothing
      // happened.
      repeatCount: 2,
    }),
    editor: LayerDefinitionEditor,
    warning: layerDefinitionWarning,
    preview: LayerDefinitionPreview,
    // Its preview draws sheets at the layer heights, so the ordinary layer sheet
    // and the Show All Layers view step aside while it is on screen — two sets at
    // the same heights would add up into one denser-looking surface.
    previewDrawsLayerSheets: true,
  };