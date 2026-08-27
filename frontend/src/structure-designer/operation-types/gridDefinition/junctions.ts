import { DOMINO_SIZE } from "../../../dimensions";
import {
  GRID_MARGIN_MM,
  LAYER_COUNT,
  MAX_JUNCTION_POINTS,
  MIN_LAYER,
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "../../constants";
import type { StructureOperationBase, StructureOperationId } from "../base";
import { repeatSpan } from "../repeat";
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
 * The two whole presets are a domino's own dimensions less one thickness. That
 * is the **overlap**: two dominoes meeting at a junction each want to stand
 * there, so the distance between neighbouring junctions is one domino short of a
 * thickness. The millimetres come from DOMINO_SIZE so what a preset is worth can
 * never drift from the dimension it names.
 *
 * **The two halves are for the layer that bridges.** A domino standing on the
 * layer above spans the gap between two below it, and to land squarely between
 * them it needs a junction halfway along. Halving an overlap spacing is what puts
 * one there, so a half grid is a whole grid with the bridging positions added
 * rather than a different grid.
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
  {
    kind: "halfLengthOverlap",
    label: "Half length-overlap",
    mm: (DOMINO_SIZE.length - DOMINO_SIZE.thickness) / 2,
  },
  {
    kind: "halfWidthOverlap",
    label: "Half width-overlap",
    mm: (DOMINO_SIZE.width - DOMINO_SIZE.thickness) / 2,
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
 * The grid a layer has when no definition reaches it.
 *
 * **Every layer always has a grid**, the same way it always has a height:
 * DEFAULT_LAYER_HEIGHT_MM covers the layers no layer definition reaches, and this
 * covers the layers no grid definition reaches — including the case of no grid
 * definition at all. Opening the screen and seeing bare plane with nowhere to
 * stand a domino would say the grid was a thing to be switched on, and it is not.
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
 * The grid on every layer, lowest first — one entry per layer.
 *
 * **Grid definitions stack exactly as layer definitions do**, and this mirrors
 * `layerHeights` in ../layerDefinition/layers.ts deliberately, down to the
 * `stopBefore` argument. The first definition covers the layers from layer 1
 * upward, the next carries on where it left off, and any layer none of them
 * reaches gets DEFAULT_GRID. How far one reaches is its Layers setting, worked
 * out by `repeatSpan` — one pass covers a single layer, since a grid definition
 * describes one grid rather than a sequence of them.
 *
 * Called with no `stopBefore` it returns LAYER_COUNT entries, padded. Called with
 * an operation's id it stops before that operation, so the result is just the
 * layers claimed *beneath* it, unpadded — its length is how many layers come
 * first, which is what the warning needs. An id that is not in the list falls
 * through to the padded whole-structure answer, which is the right reading of
 * "everything below something that isn't there".
 */
export function gridsByLayer(
  operations: readonly StructureOperationBase[],
  stopBefore?: StructureOperationId,
): GridSettings[] {
  const grids: GridSettings[] = [];

  for (const operation of operations) {
    if (operation.id === stopBefore) return grids;
    if (!isGridDefinition(operation)) continue;
    // Full up. Keep walking rather than breaking, because a later operation may
    // still be the one `stopBefore` names.
    if (grids.length >= LAYER_COUNT) continue;
    const span = repeatSpan(
      operation.repeat,
      operation.repeatCount,
      1,
      LAYER_COUNT - grids.length,
    );
    for (let i = 0; i < span; i++) grids.push(operation);
  }

  while (grids.length < LAYER_COUNT) grids.push(DEFAULT_GRID);
  return grids;
}

/**
 * The grid one layer's dominoes stand on. Everything that draws junctions goes
 * through here, so a layer with no definition reaching it and one with a
 * default-valued definition come out identical — which is what makes creating a
 * definition a quiet act.
 */
export function gridForLayer(
  operations: readonly StructureOperationBase[],
  layer: number,
): GridSettings {
  return gridsByLayer(operations)[layer - MIN_LAYER] ?? DEFAULT_GRID;
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
 * Which junction is nearest a point on the build plane, as an index into the
 * flat run of coordinates — so junction `n` is at `points[2 * n]`,
 * `points[2 * n + 1]`. Returns -1 when there are no junctions at all.
 *
 * **An index rather than the point itself**, because this is called on every
 * pointer movement while a domino is being placed. React skips re-rendering a
 * component whose state has not changed, and a number the pointer has not moved
 * far enough to change compares equal where a freshly built pair of coordinates
 * never would — so moving about inside one junction's patch of the plane costs
 * nothing at all.
 *
 * A plain walk through every junction. The grid is capped at
 * MAX_JUNCTION_POINTS, and even a grid at that cap is a few milliseconds of work
 * per second of continuous pointer movement, so there is nothing here worth the
 * bookkeeping of an index that would have to be kept in step with the grid.
 *
 * Distances are compared squared, which orders them exactly as the real
 * distances do and saves a square root per junction.
 */
export function nearestJunctionIndex(
  points: Float32Array,
  x: number,
  y: number,
): number {
  let nearest = -1;
  let nearestDistanceSquared = Infinity;
  for (let i = 0; i < points.length / 2; i++) {
    const dx = points[2 * i] - x;
    const dy = points[2 * i + 1] - y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearest = i;
    }
  }
  return nearest;
}

const PRIOR_FOREVER_WARNING =
  "WARNING: A prior grid definition covers every layer, and so this grid definition will have no effect.";

const ABOVE_LIMIT_WARNING =
  "WARNING: The grid definitions before this one already reach the top layer, so this grid definition will have no effect.";

/** What junction to look for, and where. See `junctionInWedge`. */
export interface WedgeSearch {
  /** The point the wedge opens out from, in mm. */
  fromX: number;
  fromY: number;
  /** The direction the wedge is measured **clockwise** from. Need not be unit. */
  dirX: number;
  dirY: number;
  /**
   * The wedge itself, in radians clockwise of that direction, each in 0..2π.
   * A pair with `min` above `max` describes a wedge straddling the direction
   * itself — a quarter-turn either side is `min` of 7π/4 and `max` of π/4.
   */
  minAngleRad: number;
  maxAngleRad: number;
  /**
   * A distance worth having over merely being the nearest, and how close counts.
   *
   * This is what lets a keyboard placement land on the grid at both ends when the
   * grid allows it: the junction exactly one attachment span away is the one whose
   * far end lands on a junction, and it is preferred over a closer one even though
   * the closer one would do. With no preference given, nearest wins outright.
   */
  preferredDistanceMm?: number;
  toleranceMm?: number;
  /**
   * Which of two junctions in the wedge wins, when both are allowed.
   *
   * - **`"nearest"`** (the default) — the closer one. What a diagonal placement
   *   wants: it is hunting for a *neighbour*, so being close is the point of it.
   * - **`"straightest"`** — whichever sits closer to the direction's own line,
   *   however much further along that line it is, with distance breaking a tie
   *   between two equally straight ones. What the step after a placement wants:
   *   "the next junction to the right" has to mean along the line to the right,
   *   not merely somewhere within a quarter-turn of it.
   *
   * The difference only shows once the near junctions are excluded, which is
   * exactly the case the step runs into. With a domino covering the junction
   * immediately to the right, `"nearest"` takes the one diagonally down-right —
   * it is a quarter-turn off the direction, so it is in the wedge, and at a
   * grid spacing times root two it is nearer than the second one along the row.
   */
  ranking?: "nearest" | "straightest";
  /** Junctions this search may not choose — buried ones, in practice. */
  isExcluded?: (index: number) => boolean;
}

const TWO_PI = Math.PI * 2;

/**
 * How far off the line two junctions may be before `"straightest"` calls one of
 * them straighter than the other.
 *
 * Every grid geometry lays its junctions out in exact rows and columns, so the
 * ones on the line are on it and the rest are a whole grid spacing away — this
 * is only absorbing the rounding, not making a judgement. Junction coordinates
 * are held as 32-bit floats, which keep about seven digits, so a point most of
 * a metre out along the plane can be a ten-thousandth of a millimetre off where
 * the arithmetic put it.
 */
const STRAIGHT_MATCH_EPS_MM = 0.05;

/**
 * The junction to aim at within a wedge of directions, or -1 when the wedge is
 * empty.
 *
 * **This is how a diagonal keyboard placement finds its neighbour.** Aiming at a
 * fixed forty-five degrees would be right for a rectangular grid and wrong for
 * every other one — an isometric or hexagonal grid puts its neighbours at thirty
 * and sixty degrees, and a ray between them would miss both and record a
 * placement as off the grid that could have been on it. So the direction is not
 * decided in advance: a wedge is swept and whichever junction is in it wins.
 *
 * Preference first, then whatever `ranking` asks for, with distance breaking
 * the tie. See `preferredDistanceMm` and `ranking`.
 *
 * A plain walk through every junction, bounded by MAX_JUNCTION_POINTS, for the
 * same reason `nearestJunctionIndex` is — except that this runs once per press of
 * a key rather than on every movement of the pointer, so it has even less to
 * prove.
 */
export function junctionInWedge(
  points: Float32Array,
  search: WedgeSearch,
): number {
  const dirLength = Math.hypot(search.dirX, search.dirY);
  if (dirLength === 0) return -1;
  const dirX = search.dirX / dirLength;
  const dirY = search.dirY / dirLength;

  const tolerance = search.toleranceMm ?? 0;
  const straightest = search.ranking === "straightest";
  let best = -1;
  let bestDistance = Infinity;
  let bestOffLine = Infinity;
  let bestPreferred = false;

  for (let i = 0; i < points.length / 2; i++) {
    if (search.isExcluded?.(i)) continue;

    const dx = points[2 * i] - search.fromX;
    const dy = points[2 * i + 1] - search.fromY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) continue;

    /*
     * The angle from the direction round to this junction, measured clockwise.
     *
     * atan2 of the cross product over the dot product gives the turn from the
     * direction to the junction, counted anticlockwise; negating it counts it
     * clockwise instead, and adding a full turn to a negative answer brings it
     * into 0..2π so it can be compared against the wedge.
     */
    const anticlockwise = Math.atan2(dirX * dy - dirY * dx, dirX * dx + dirY * dy);
    let clockwise = -anticlockwise;
    if (clockwise < 0) clockwise += TWO_PI;

    const inWedge =
      search.minAngleRad <= search.maxAngleRad
        ? clockwise >= search.minAngleRad && clockwise <= search.maxAngleRad
        : clockwise >= search.minAngleRad || clockwise <= search.maxAngleRad;
    if (!inWedge) continue;

    const preferred =
      search.preferredDistanceMm !== undefined &&
      Math.abs(distance - search.preferredDistanceMm) <= tolerance;

    /*
     * How far the junction sits off the line the direction runs along.
     *
     * The cross product of two vectors in the plane is the area of the
     * parallelogram they make, counted negative when the second is clockwise of
     * the first. That area is the base times the height, and the base here is
     * the direction, which was made a unit long above — so the area *is* the
     * height, which is the distance from the line. Only how far, not which
     * side, hence the absolute value.
     */
    const offLine = Math.abs(dirX * dy - dirY * dx);

    /*
     * A preferred junction beats an unpreferred one however much nearer that
     * one is. Failing that it is whatever `ranking` asked for, and distance
     * settles anything still level.
     *
     * The two off-the-line distances are compared with room for rounding rather
     * than exactly, so that a row of junctions the direction runs straight along
     * counts as one row rather than as a ladder of infinitesimally straighter
     * ones — see STRAIGHT_MATCH_EPS_MM.
     */
    let better: boolean;
    if (preferred !== bestPreferred) {
      better = preferred;
    } else if (straightest && Math.abs(offLine - bestOffLine) > STRAIGHT_MATCH_EPS_MM) {
      better = offLine < bestOffLine;
    } else {
      better = distance < bestDistance;
    }

    if (better) {
      best = i;
      bestDistance = distance;
      bestOffLine = offLine;
      bestPreferred = preferred;
    }
  }

  return best;
}

/**
 * Why this grid definition has no effect, or undefined when it does have one.
 *
 * Three ways to be pointless, and they want different sentences. Two are about
 * where the definition sits — squeezed out by an earlier one covering every
 * layer, or by earlier ones counting their way to the last layer — and are read
 * off the same `gridsByLayer` call the canvas uses, so a row can never be
 * reddened for a reason the canvas contradicts. The third is about the
 * definition itself: a spacing so small that the plane would need more junctions
 * than anything can usefully draw or a builder could ever place, read off the
 * same estimate the generator refuses on.
 *
 * Position first, because a definition that reaches no layer at all has nothing
 * to say about its spacing.
 */
export function gridDefinitionWarning(
  operation: GridDefinitionOperation,
  operations: readonly StructureOperationBase[],
): string | undefined {
  const below = gridsByLayer(operations, operation.id);
  if (below.length >= LAYER_COUNT) {
    const coversEveryLayer = operations
      .slice(0, operations.findIndex((o) => o.id === operation.id))
      .some((o) => isGridDefinition(o) && o.repeat === "forever");
    return coversEveryLayer ? PRIOR_FOREVER_WARNING : ABOVE_LIMIT_WARNING;
  }

  const plan = planGrid(operation);
  if (!plan || plan.estimate <= MAX_JUNCTION_POINTS) return undefined;
  return `WARNING: The spacing is too small — this grid would need more than ${MAX_JUNCTION_POINTS} junction points.`;
}