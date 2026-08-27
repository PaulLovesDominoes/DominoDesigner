import { RiGridLine } from "@remixicon/react";

import type { StructureOperationBase, StructureOperationDefinition } from "../base";
import type { RepeatKind } from "../repeat";
import GridDefinitionEditor from "./editor";
import { DEFAULT_GRID, gridDefinitionWarning } from "./junctions";
import GridDefinitionPreview from "./preview";

/**
 * A grid of junction points laid across a run of the structure's layers.
 *
 * A junction point is somewhere a domino can be stood; the segments between
 * neighbouring junctions are where dominoes lie. **Grid definitions stack the
 * way layer definitions do** — the first covers the layers from layer 1 upward,
 * the next carries on above it, and any layer none of them reaches keeps
 * DEFAULT_GRID. The dots are drawn on the layer being worked on.
 *
 * The patterns themselves are in geometries.ts and where they land on the plane
 * is in junctions.ts; this file is the shape of the data and the registry entry.
 *
 * Every field here is a string, a number or a true/false. That is on purpose: a
 * structure's description is eventually written out as JSON for the Designer to
 * read, and this is already the shape it will be written in.
 */

/** Which pattern the junctions fall into. See geometries.ts for each one. */
export type GridGeometryKind =
  | "rectangular"
  | "isometric"
  | "hexagonal"
  | "octagonal";

/**
 * Where a spacing comes from. The first two are a domino's own dimensions less
 * one thickness for the overlap where two meet at a junction; the next two are
 * those halved, which is where a bridging domino on the layer above lands;
 * "custom" is a number the user typed. See GRID_SPACING_KINDS in junctions.ts.
 */
export type GridSpacingKind =
  | "lengthOverlap"
  | "widthOverlap"
  | "halfLengthOverlap"
  | "halfWidthOverlap"
  | "custom";

/** One spacing control. `mm` is read only when kind is "custom". */
export interface GridSpacing {
  kind: GridSpacingKind;
  mm: number;
}

/**
 * Everything that describes a grid, with none of what makes it an operation.
 *
 * Split out from the operation below because the structure has a grid whether or
 * not anyone has defined one: with no grid definition in the list, DEFAULT_GRID
 * in junctions.ts supplies these same fields. That is the arrangement layer
 * heights already have, where DEFAULT_LAYER_HEIGHT_MM covers every layer no
 * definition reaches. Everything that works out where the dots go therefore
 * takes one of these rather than an operation, and cannot tell which it was
 * handed.
 */
export interface GridSettings {
  geometry: GridGeometryKind;
  /**
   * The horizontal spacing for the rectangular grid, and the segment length for
   * every other geometry — the one place a field's name and the label above it
   * deliberately disagree. The alternative was a third field standing empty
   * whenever the grid was not rectangular.
   */
  spacingX: GridSpacing;
  /** The vertical spacing. Read only by the rectangular grid. */
  spacingY: GridSpacing;
  /**
   * Whether the pattern is pulled apart by one segment, with squares dropped
   * into the gaps. Read only by the geometries that have two forms.
   *
   * **Cleared when the geometry changes**, along with `rotate45` — unlike
   * `spacingY`, which is kept. Both flags are answers about a particular
   * pattern, so carrying them across would land the new geometry in a state
   * nobody chose for it; a distance in millimetres means the same thing
   * whichever pattern is being measured.
   */
  expanded: boolean;
  /** Whether the whole grid is turned forty-five degrees. Cleared with `expanded`. */
  rotate45: boolean;
}

export interface GridDefinitionOperation
  extends StructureOperationBase,
    GridSettings {
  type: "gridDefinition";
  /**
   * How many layers this grid covers, starting where the definitions before it
   * left off.
   *
   * **The dialog labels this row `Layers`, not `Repeat`.** A grid already repeats
   * across the plane in X and Y, so a control called Repeat sitting beside the
   * spacings would be two kinds of repetition told apart by context. The field
   * keeps the name the shared control and `repeatSpan` use — see ../repeat.ts —
   * because only the wording above the row needed to differ.
   */
  repeat: RepeatKind;
  /**
   * How many layers when `repeat` is "count". Kept when the mode is switched
   * away and back, so flipping to Forever to see what it looks like doesn't lose
   * the number that was typed.
   */
  repeatCount: number;
}

export const gridDefinitionDefinition: StructureOperationDefinition<GridDefinitionOperation> =
  {
    type: "gridDefinition",
    icon: RiGridLine,
    defaultName: "Grid Definition",
    toolbarLabel: "New Grid Definition",
    // A new grid definition starts as a copy of the grid the structure already
    // had, covering every layer, so creating one changes nothing on the canvas
    // until something is edited. Making one is then a decision to take the
    // default grid over, not a jump to some other grid.
    create: (id) => ({
      id,
      name: "Grid Definition",
      type: "gridDefinition",
      ...DEFAULT_GRID,
      repeat: "forever",
      // Two rather than one, because Count = 1 is exactly what Once already
      // means — landing there on switching to Count would look like nothing
      // happened.
      repeatCount: 2,
    }),
    editor: GridDefinitionEditor,
    warning: gridDefinitionWarning,
    preview: GridDefinitionPreview,
  };