import { RiCursorLine, type RemixiconComponentType } from "@remixicon/react";

import type { DDObjectType } from "../object-types/registry";
import type { ToolId } from "../types";

export interface ToolDef {
  id: ToolId;
  label: string;
  Icon: RemixiconComponentType;
}

/**
 * The one tool that places nothing, and so the one with a toolbar button of its
 * own — every element-creation tool lives in NewElementMenu's popup instead.
 *
 * `as const` keeps `id` as the literal "select" rather than widening it to
 * ToolId. That's what lets it be handed to setTool, which deliberately refuses
 * "newElement" (see store.ts).
 */
export const SELECT_TOOL = {
  id: "select",
  label: "Select",
  Icon: RiCursorLine,
} as const satisfies ToolDef;

/**
 * One entry per DDObject type that can be drawn onto the build plane. They all
 * share the single "newElement" ToolId, so there is no id here: the element
 * type *is* the identity, and the store holds which one is armed
 * (newElementType) for as long as the tool is active.
 */
export interface PlacementToolDef {
  /**
   * The type this places, through that type's own createFromRegion. Its icon
   * comes from the type too (the registry's getDDObjectIcon), so the New menu
   * and the hierarchy panel can't show a type under two different glyphs.
   */
  elementType: DDObjectType;
  /** Menu text. Deliberately shorter than the type's defaultName. */
  label: string;
  /** What ModeHintBar asks the user to do while this type is armed. */
  placementHint: string;
}

// Add a placeable type by appending here — that's the whole edit. The New menu,
// the placement drag, the crosshair cursor and the hint bar all read this list,
// and none of them names a type.
export const PLACEMENT_TOOLS: PlacementToolDef[] = [
  {
    elementType: "fieldElement",
    label: "Field",
    placementHint: "Drag on the build plane to place a field",
  },
];

/** The entry for `elementType`, or undefined when nothing is armed. */
export const placementToolFor = (
  elementType: DDObjectType | null,
): PlacementToolDef | undefined =>
  elementType === null
    ? undefined
    : PLACEMENT_TOOLS.find((tool) => tool.elementType === elementType);