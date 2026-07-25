import {
  RiCursorLine,
  RiGridFill,
  type RemixiconComponentType,
} from "@remixicon/react";

import type { DDObjectType } from "../object-types/registry";
import type { ToolId } from "../types";

export interface ToolDef {
  id: ToolId;
  label: string;
  Icon: RemixiconComponentType;
  /**
   * If set, this tool draws a region on the build plane to create an instance
   * of this type (via the type's createFromRegion). Omit for tools that don't
   * place an element — CreateByRegionTool only arms for a tool that declares one.
   */
  elementType?: DDObjectType;
}

// The left-justified tool buttons. Add a tool by appending here (and adding its
// id to ToolId in types.ts) — the toolbar and single-select behavior scale
// automatically.
export const TOOLS: ToolDef[] = [
  { id: "select", label: "Select", Icon: RiCursorLine },
  {
    id: "field",
    label: "Field",
    Icon: RiGridFill,
    elementType: "fieldElement",
  },
];
