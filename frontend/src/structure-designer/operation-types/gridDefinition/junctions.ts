import { DOMINO_SIZE } from "../../../dimensions";
import {
  GRID_MARGIN_MM,
  MAX_JUNCTION_POINTS,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "../../constants";
import type { StructureOperationBase } from "../base";
import { GRID_GEOMETRIES, type GridLattice, type GridPoint } from "./geometries";
import type {
  GridDefinitionOperation,
  GridSettings,
  GridSpacing,
  GridSpacingKind,
} from "./object-model";

/**
 * Turning a grid definition into the junction points it describes.
 *
 * A **junction point** is somewhere a domino can be stood, and the segments
 * between neighbouring junctions are where dominoes lie. Which pattern the
 * junctions fall into is geometries.ts's business; this file is about where that
 * pattern is anchored on the build plane, how far it reaches, and how many
 * points is too many.
 *
 * Pure and free of React, so the eventual JSON exporter can use it too. It
 * imports only *types* from object-model.ts, so the two referencing each other
 * closes no import cycle at run time.
 */

/**
 * Where a spacing comes from, and how it is written in the Type pull-down.
 *
 * The two presets are a domino's own dimensions less one thickness. That is the
 * **overlap**: two dominoes meeting at a junction each want to stand there, so
 * the distance between neighbouring junctions is one domino short of a
 * thickness. The millimetres come from DOMINO_SIZE so what a preset is worth can
 * never drift from the dimension it names.
 *
 * The labels are the bare names, unlike the Layer Heights list's, which spell
 * their millimetres out. A spacing row has a box beside the pull-down already
 * showing the figure, so putting it in the label as well would print the same
 * number twice side by side.
 *
 * "Custom" carries no millimetres of its own — that is the one kind whose
 * spacing keeps a number the user typed. See `spacingMm`.
 */
export const GRID_SPACING_KINDS = [
  {
    kind: "lengthOverlap",
    label: "Length-overlap",
    mm: DOMINO_SIZE.length - DOMINO_SIZE.thickness,
  },
  {
    kind: "widthOverlap",
    label: "Width-overlap",
    mm: DOMINO_SIZE.width - DOMINO_SIZE.thickness,
  },
  { kind: "custom", label: "Custom", mm: null },
] as const satisfies readonly {
  kind: GridSpacingKind;
  label: string;
  mm: number | null;
}[];

/** What a spacing switched to Custom starts at, before anything is typed. */
export const DEFAULT_CUSTOM_SPACING_MM = DOMINO_SIZE.length - DOMINO_SIZE.thickness;

/**
 * The grid a structure has when nobody has defined one.
 *
 * **A structure always has a grid**, the same way it always has a height for
 * every layer: DEFAULT_LAYER_HEIGHT_MM covers the layers no definition reaches,
 * and this covers the case of no grid definition at all. Opening the screen and
 * seeing bare plane with nowhere to stand a domino would say the grid was a
 * thing to be switched on, and it is not.
 *
 * Plain rows and columns a domino-length apart in both directions — by far the
 * most common way to lay out a structure, and the arrangement someone who never
 * opens the grid dialog is most likely to have wanted. A grid definition created
 * from the toolbar starts as a copy of it, so making one changes nothing until
 * something in it is edited.
 */
export const DEFAULT_GRID: GridSettings = {
  geometry: "rectangular",
  spacingX: { kind: "lengthOverlap", mm: DEFAULT_CUSTOM_SPACING_MM },
  spacingY: { kind: "lengthOverlap", mm: DEFAULT_CUSTOM_SPACING_MM },
  expanded: false,
  rotate45: false,
};

/**
 * A spacing below this is treated as still being typed rather than as a value,
 * so the grid is never asked for junctions a hair apart. Small enough that any
 * real measurement can still be typed one character at a time.
 */
export const MIN_SPACING_MM = 0.1;

/** The distance in mm one spacing control stands for. */
export function spacingMm(spacing: GridSpacing): number {
  const kind = GRID_SPACING_KINDS.find((k) => k.kind === spacing.kind);
  return kind?.mm ?? spacing.mm;
}

/** Whether this operation is a grid definition — the narrowing this file needs. */
export function isGridDefinition(
  operation: StructureOperationBase,
): operation is GridDefinitionOperation {
  return operation.type === "gridDefinition";
}

/**
 * The structure's grid definition, or undefined when there is none.
 *
 * **There can only ever be one.** The toolbar refuses to create a second while
 * one exists (see `gridDefinitionCreateDisabledReason`), and undo cannot
 * manufacture one either, so this is a lookup rather than a rule about which of
 * several wins. Every reader goes through it anyway, so the day a release wants
 * a grid per layer there is one place that has to change its mind.
 *
 * Use `effectiveGrid` to *draw* the grid; this one answers the narrower question
 * of whether the user has defined a grid of their own, which is what the toolbar
 * needs and what nothing else should ask.
 */
export function effectiveGridDefinition(
  operations: readonly StructureOperationBase[],
): GridDefinitionOperation | undefined {
  return operations.find(isGridDefinition);
}

/**
 * The grid the structure actually has: the one defined, or DEFAULT_GRID when
 * none is. Everything that draws junctions goes through here, so a structure
 * with no grid definition and one with a default-valued definition come out
 * identical — which is what makes creating a definition a quiet act.
 */
export function effectiveGrid(
  operations: readonly StructureOperationBase[],
): GridSettings {
  return effectiveGridDefinition(operations) ?? DEFAULT_GRID;
}

/**
 * The rectangle the dots fill: the build plane less a margin on every side, so
 * the grid never runs right up to the edge.
 */
const gridArea = () => ({
  minX: GRID_MARGIN_MM,
  minY: GRID_MARGIN_MM,
  maxX: STRUCTURE_PLANE_WIDTH_MM - GRID_MARGIN_MM,
  maxY: STRUCTURE_PLANE_HEIGHT_MM - GRID_MARGIN_MM,
});

const rotate45 = (p: GridPoint): GridPoint => {
  // cos 45 and sin 45 are the same number, so one multiply serves both.
  const k = Math.SQRT1_2;
  return [(p[0] - p[1]) * k, (p[0] + p[1]) * k];
};

/**
 * How far outside the area's own cells to look. A basis point can lean out of
 * the cell it belongs to, so the cells just beyond the edge can still put a
 * junction inside the area. Two cells is comfortably more than any basis here
 * reaches.
 */
const CELL_MARGIN = 2;

/**
 * How far outside the area a junction may land and still be kept.
 *
 * The anchors exist to put junctions *exactly* on the area's edges — a seated
 * hexagon rests its bottom edge on the bottom margin, and an octagon touches the
 * left one. Those coordinates are reached by adding up an anchor, a few lattice
 * steps and a basis point, and arithmetic on fractions of a root of three does
 * not land on a round number: the answer comes out a hair either side. Clipped
 * on the raw comparison, the dots that were carefully seated on the line would
 * be dropped about half the time, and which half would change with the spacing.
 *
 * A thousandth of a micrometre is far below anything the screen or a domino
 * cares about, and far above the error being allowed for.
 */
const CLIP_EPS_MM = 1e-6;

interface GridPlan {
  lattice: GridLattice;
  iMin: number;
  iMax: number;
  jMin: number;
  jMax: number;
  /** Junctions this would emit before clipping — what the limit is checked on. */
  estimate: number;
}

/**
 * Work out which repeats of the pattern can reach the area, without generating
 * anything. Both the generator and the warning need this, and they must agree:
 * a grid refused for being too big has to be the same grid the warning names.
 *
 * Returns undefined for a grid that cannot be drawn at all — a spacing still
 * being typed, or two lattice vectors that lie along the same line and so never
 * spread out across the plane.
 */
function planGrid(grid: GridSettings): GridPlan | undefined {
  const geometry = GRID_GEOMETRIES[grid.geometry];
  const spacingX = spacingMm(grid.spacingX);
  const spacingY = spacingMm(grid.spacingY);

  // The Y spacing is only checked for a geometry that reads it. Everything else
  // is built from the one segment length, and refusing to draw a hexagon grid
  // over a Y spacing it never looks at would be a bug with no way to see the
  // cause: the row that holds the offending number is not even on screen.
  // Comparisons written this way round so a value that is not a number at all
  // fails them rather than slipping through.
  if (!(spacingX >= MIN_SPACING_MM)) return undefined;
  if (geometry.spacing === "xy" && !(spacingY >= MIN_SPACING_MM)) return undefined;

  const raw = geometry.lattice({ spacingX, spacingY, expanded: grid.expanded });
  // Turning the anchor along with everything else makes Rotate 45 exactly what
  // it sounds like: the whole grid, seating and all, turned about the area's
  // lower-left corner. Leaving the anchor unturned would keep a tile squared up
  // against the corner while the pattern around it leaned, which is neither what
  // the anchor is for nor what the tick box says.
  const lattice: GridLattice = grid.rotate45
    ? {
        a1: rotate45(raw.a1),
        a2: rotate45(raw.a2),
        basis: raw.basis.map(rotate45),
        anchor: rotate45(raw.anchor),
      }
    : raw;

  const [a1x, a1y] = lattice.a1;
  const [a2x, a2y] = lattice.a2;
  // How much area one repeat covers. Zero means the two steps run along the same
  // line, so stepping them would only ever walk up and down one line.
  const spread = a1x * a2y - a2x * a1y;
  if (Math.abs(spread) < 1e-9) return undefined;

  // The pattern's origin sits at the area's lower-left corner plus the
  // geometry's own anchor (see GridLattice.anchor), so the area's four corners
  // are measured from there.
  const area = gridArea();
  const [anchorX, anchorY] = lattice.anchor;
  const width = area.maxX - area.minX;
  const height = area.maxY - area.minY;
  const corners: GridPoint[] = [
    [-anchorX, -anchorY],
    [width - anchorX, -anchorY],
    [-anchorX, height - anchorY],
    [width - anchorX, height - anchorY],
  ];

  let iMin = Infinity;
  let iMax = -Infinity;
  let jMin = Infinity;
  let jMax = -Infinity;
  for (const [x, y] of corners) {
    // How many of each step it takes to reach this corner. Undoing a pair of
    // steps is what the divide by `spread` does.
    const i = (x * a2y - y * a2x) / spread;
    const j = (a1x * y - a1y * x) / spread;
    iMin = Math.min(iMin, i);
    iMax = Math.max(iMax, i);
    jMin = Math.min(jMin, j);
    jMax = Math.max(jMax, j);
  }

  const plan = {
    lattice,
    iMin: Math.floor(iMin) - CELL_MARGIN,
    iMax: Math.ceil(iMax) + CELL_MARGIN,
    jMin: Math.floor(jMin) - CELL_MARGIN,
    jMax: Math.ceil(jMax) + CELL_MARGIN,
  };

  return {
    ...plan,
    estimate:
      (plan.iMax - plan.iMin + 1) *
      (plan.jMax - plan.jMin + 1) *
      lattice.basis.length,
  };
}

/**
 * Every junction the grid describes, as a flat run of x, y, x, y, … in
 * millimetres.
 *
 * Flat pairs with no height, because the same grid applies to every layer and
 * only the height it is drawn at changes — see JunctionGrid.tsx, which moves the
 * whole set of dots rather than rebuilding them per layer. A Float32Array
 * because this goes straight to the GPU as it is.
 *
 * **The pattern is seated on the area's lower-left corner**, each geometry
 * placing itself there through its own `anchor` (see GridLattice) so that a
 * whole hexagon or octagon sits against both margins rather than a fragment of
 * one. That is also what gives the square-on patterns a full row of dots along
 * the bottom and a full column up the left. A pattern turned forty-five degrees
 * cannot have a straight row along an edge at all; it turns about that same
 * corner, and the seating turns with it.
 *
 * Returns nothing at all when the grid would need more than MAX_JUNCTION_POINTS.
 * The user is told why by `gridDefinitionWarning`, off the same estimate.
 */
export function generateJunctionPoints(grid: GridSettings): Float32Array {
  const plan = planGrid(grid);
  if (!plan || plan.estimate > MAX_JUNCTION_POINTS) return new Float32Array(0);

  const { lattice, iMin, iMax, jMin, jMax } = plan;
  const [a1x, a1y] = lattice.a1;
  const [a2x, a2y] = lattice.a2;
  const [anchorX, anchorY] = lattice.anchor;
  const area = gridArea();

  const points: number[] = [];
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const cellX = area.minX + anchorX + i * a1x + j * a2x;
      const cellY = area.minY + anchorY + i * a1y + j * a2y;
      for (const [bx, by] of lattice.basis) {
        const x = cellX + bx;
        const y = cellY + by;
        if (
          x < area.minX - CLIP_EPS_MM ||
          x > area.maxX + CLIP_EPS_MM ||
          y < area.minY - CLIP_EPS_MM ||
          y > area.maxY + CLIP_EPS_MM
        ) {
          continue;
        }
        points.push(x, y);
      }
    }
  }

  return new Float32Array(points);
}

/**
 * Why this grid definition has no effect, or undefined when it does have one.
 *
 * One cause only: a spacing so small that the plane would need more junctions
 * than anything can usefully draw or a builder could ever place. The other way a
 * definition could have been pointless — sitting behind one that already defines
 * the grid — cannot happen, because the toolbar will not create a second.
 *
 * Read off the same estimate the generator refuses on, so a reddened row can
 * never disagree with what is on the canvas.
 */
export function gridDefinitionWarning(
  operation: GridDefinitionOperation,
): string | undefined {
  const plan = planGrid(operation);
  if (!plan || plan.estimate <= MAX_JUNCTION_POINTS) return undefined;
  return `WARNING: The spacing is too small — this grid would need more than ${MAX_JUNCTION_POINTS} junction points.`;
}

const ONE_GRID_ONLY =
  "A grid definition already exists. All layers share one grid.";

/**
 * Why a grid definition cannot be created right now, or undefined when one can.
 *
 * All layers share one grid in this release, so a second definition would have
 * nothing to do. Refusing the creation says that plainly, where allowing one and
 * then explaining that it does nothing would not.
 */
export function gridDefinitionCreateDisabledReason(
  operations: readonly StructureOperationBase[],
): string | undefined {
  return effectiveGridDefinition(operations) ? ONE_GRID_ONLY : undefined;
}