import type { GridGeometryKind } from "./object-model";

/**
 * The patterns a grid of junction points can be laid out in, and the maths that
 * produces each one.
 *
 * Every pattern here is described the same way, which is what keeps this file
 * short and the generator in junctions.ts free of any knowledge about octagons:
 *
 * - A **lattice** is two vectors, `a1` and `a2`. Starting anywhere and stepping
 *   whole numbers of each reaches every repeat of the pattern, the way a floor
 *   of identical tiles repeats sideways and upwards.
 * - A **basis** is the handful of points inside one repeat. Every junction in
 *   the whole grid is then `i * a1 + j * a2 + basis[k]`, for whole numbers i and
 *   j and every k.
 *
 * Each basis below holds exactly one repeat's worth of junctions and no more, so
 * walking the lattice emits every junction exactly once. That is worth saying,
 * because the obvious way to build these — draw every polygon and collect its
 * corners — produces each corner two or three times over and then needs
 * floating-point comparisons to weed out the duplicates, which is a thing that
 * does not reliably work.
 *
 * Pure, React-free, and importing only *types* from object-model.ts (which
 * TypeScript erases at compile time), so although the two files reference each
 * other on paper there is no import cycle at run time.
 */

/** A point, or a vector — two numbers either way. */
export type GridPoint = readonly [number, number];

const pt = (x: number, y: number): GridPoint => [x, y];

export interface GridLattice {
  a1: GridPoint;
  a2: GridPoint;
  /** The junctions inside one repeat of the pattern. */
  basis: readonly GridPoint[];
  /**
   * Where to put the pattern's origin, measured from the lower-left corner of
   * the area the dots fill.
   *
   * This is what seats a **whole** tile against the bottom-left corner. Left at
   * nothing, each pattern lands wherever its own maths happens to put it, and
   * most of them end up with a tile straddling the corner — showing two or three
   * stray dots that belong to a shape the rest of which is off the plane. Nudging
   * the pattern so the first *complete* hexagon or octagon sits against both
   * margins is what the eye wants, and it also gives every geometry a full row
   * along the bottom and a full column up the left.
   *
   * Each one below says what it is seating and where that puts it. The value is
   * always a fraction of a repeat, never a whole one — a whole repeat would move
   * the pattern without changing how it looks at all.
   */
  anchor: GridPoint;
}

/** What a geometry needs to know to build its lattice. */
export interface GridLatticeInput {
  /** The X spacing for the rectangular grid; the segment length for the rest. */
  spacingX: number;
  /** Read only by the rectangular grid. */
  spacingY: number;
  /** Read only by the geometries whose `expandable` is true. */
  expanded: boolean;
}

export interface GridGeometryDefinition {
  /** How the geometry is written in the Grid Geometry pull-down. */
  label: string;
  /**
   * Which spacing rows the editor draws: "xy" for a grid with independent
   * horizontal and vertical spacing, "segment" for one built from a single edge
   * length. This and `expandable` are the whole of what the editor needs, which
   * is what keeps it free of per-geometry markup.
   */
  spacing: "xy" | "segment";
  /** Whether the Expanded tick box means anything for this geometry. */
  expandable: boolean;
  lattice(input: GridLatticeInput): GridLattice;
}

// ── The individual patterns ──
//
// Square roots are worked out inside these functions rather than at the top of
// the file. Nothing here runs until a grid is actually being drawn, which is the
// habit this codebase keeps for a type's geometry helpers.

/**
 * Plain rows and columns: one junction per cell.
 *
 * No anchor to work out — a rectangle's own corner is already the corner, so a
 * junction lands exactly on the area's lower-left and the first row and column
 * run along the bottom and up the left.
 */
function rectangular({ spacingX, spacingY }: GridLatticeInput): GridLattice {
  return {
    a1: pt(spacingX, 0),
    a2: pt(0, spacingY),
    basis: [pt(0, 0)],
    anchor: pt(0, 0),
  };
}

/**
 * Equilateral triangles — rows of junctions, each row shifted half a segment
 * along from the one below and separated by a triangle's height. Six segments
 * meet at every junction.
 *
 * No anchor: a junction already lands on the corner, and the triangle standing
 * on it is whole.
 */
function triangular({ spacingX: s }: GridLatticeInput): GridLattice {
  return {
    a1: pt(s, 0),
    a2: pt(s / 2, (s * Math.sqrt(3)) / 2),
    basis: [pt(0, 0)],
    anchor: pt(0, 0),
  };
}

/**
 * A honeycomb of plain hexagons, drawn flat-topped to match the reference
 * pictures. Three segments meet at every junction.
 *
 * Two junctions per repeat, because a honeycomb is not itself a lattice: no
 * single pair of steps reaches every corner of a hexagon, so the pattern is two
 * interleaved lattices, one for each of the two corners a repeat contributes.
 *
 * Anchor: the hexagon sitting on the corner is complete but for its leftmost
 * corner, which falls half a segment outside. Half a segment to the right brings
 * it in, and the hexagon then rests its bottom edge on the bottom margin with
 * its left corner touching the left one.
 */
function honeycomb({ spacingX: s }: GridLatticeInput): GridLattice {
  const halfHeight = (s * Math.sqrt(3)) / 2;
  return {
    a1: pt((3 * s) / 2, halfHeight),
    a2: pt((3 * s) / 2, -halfHeight),
    basis: [pt(0, 0), pt(s, 0)],
    anchor: pt(s / 2, 0),
  };
}

/**
 * The honeycomb pulled apart by one segment in every direction, with a square
 * dropped into each gap and a triangle at each corner — the tiling of hexagons,
 * squares and triangles in Expanded-Hexagon.png. Four segments meet at every
 * junction.
 *
 * The hexagons keep their own centres on a triangular lattice; separating them
 * by a square widens the step between neighbouring centres from the hexagon's
 * width to that plus one segment, which is where the (1 + root 3) comes from.
 * The basis is one hexagon's six corners, and no other shape contributes a
 * corner of its own — every square and triangle corner is already a hexagon's.
 *
 * Anchor: a hexagon otherwise sits centred on the corner, three-quarters of it
 * off the plane, leaving two stray dots behind. Moving back by half a step
 * across and half a segment up drops it entirely and brings the next hexagon
 * down onto the corner whole — the same seating the plain honeycomb gets, with
 * its bottom edge on the bottom margin and its left corner on the left one.
 */
function rhombitrihexagonal({ spacingX: s }: GridLatticeInput): GridLattice {
  const step = s * (1 + Math.sqrt(3));
  const basis: GridPoint[] = [];
  for (let corner = 0; corner < 6; corner++) {
    const angle = (corner * Math.PI) / 3;
    basis.push(pt(s * Math.cos(angle), s * Math.sin(angle)));
  }
  // Neighbouring hexagons lie across the flat faces, which on a flat-topped
  // hexagon point 30 degrees off horizontal.
  return {
    a1: pt((step * Math.sqrt(3)) / 2, step / 2),
    a2: pt((step * Math.sqrt(3)) / 2, -step / 2),
    basis,
    anchor: pt(-step / 2, -s / 2),
  };
}

/**
 * Regular octagons packed as tightly as they go, with a small square turned
 * forty-five degrees filling each gap — the pattern in Octogon.png, and what a
 * square grid becomes when every corner is cut off. Three segments meet at every
 * junction.
 *
 * The octagon centres sit on a plain square lattice whose step is the octagon's
 * width across the flats. The basis is the four corners of one of the small
 * squares: every junction in the pattern is a corner of exactly one of them, so
 * four per repeat is the whole of it.
 *
 * Anchor: left alone, the shape nearest the corner is one of the small squares
 * and the octagons around it are all cut. Moving back by half a step each way
 * puts an octagon there instead, resting a flat side on each margin, and the
 * small square takes the cut-off place at the corner.
 */
function truncatedSquare({ spacingX: s }: GridLatticeInput): GridLattice {
  const step = s * (1 + Math.sqrt(2));
  const centre = step / 2;
  // Half the small square's diagonal — the reach from its middle to a corner.
  const reach = s / Math.sqrt(2);
  return {
    a1: pt(step, 0),
    a2: pt(0, step),
    basis: [
      pt(centre - reach, centre),
      pt(centre + reach, centre),
      pt(centre, centre - reach),
      pt(centre, centre + reach),
    ],
    anchor: pt(-centre, -centre),
  };
}

/**
 * The pattern above pulled apart by exactly one segment, with an upright square
 * dropped into each gap — Expanded-Octogon.png. Three segments meet at every
 * junction, as they do in the packed version: an octagon's straight edge, its
 * slanted one, and the side of the square.
 *
 * The step between octagon centres is therefore the packed pattern's step plus
 * one segment, which is the only difference between this and truncatedSquare
 * worth holding on to. The basis is one octagon's own eight corners; the squares
 * and the open diamonds between them contribute none, since every corner they
 * have is already an octagon's.
 *
 * **The only pattern with no anchor of its own**, and deliberately so. Seating a
 * whole octagon against the corner the way the other three do was put side by
 * side with this and turned down: where its own maths puts it reads better. Left
 * as the considered exception rather than tidied into the rule.
 */

/*
NOTE:  Turns out this is the same as "truncatedSquare", just rotated 45-degrees
(for which there is already a separate control), so this has been commented out for now.

function expandedOctagonal({ spacingX: s }: GridLatticeInput): GridLattice {
  // How far it is from an octagon's middle to the middle of one of its flat
  // sides — half its width across the flats.
  const reach = (s * (1 + Math.sqrt(2))) / 2;
  const half = s / 2;
  const step = s * (2 + Math.sqrt(2));
  return {
    a1: pt(step, 0),
    a2: pt(0, step),
    basis: [
      pt(-half, -reach),
      pt(half, -reach),
      pt(-half, reach),
      pt(half, reach),
      pt(-reach, -half),
      pt(-reach, half),
      pt(reach, -half),
      pt(reach, half),
    ],
    anchor: pt(0, 0),
  };
}
*/

// ── Register grid geometries here ──
// Adding one is an entry below plus a member in GridGeometryKind. The editor
// draws its rows from `spacing` and `expandable`, and junctions.ts walks
// whatever lattice it returns, so neither of them needs touching.
export const GRID_GEOMETRIES = {
  rectangular: {
    label: "Rectangular",
    spacing: "xy",
    expandable: false,
    lattice: rectangular,
  },
  isometric: {
    label: "Isometric (triangles)",
    spacing: "segment",
    expandable: false,
    lattice: triangular,
  },
  hexagonal: {
    label: "Hexagonal",
    spacing: "segment",
    expandable: true,
    lattice: (input) => (input.expanded ? rhombitrihexagonal(input) : honeycomb(input)),
  },
  octagonal: {
    label: "Octagonal",
    spacing: "segment",
    expandable: false,
    lattice: truncatedSquare,
  },
} satisfies Record<GridGeometryKind, GridGeometryDefinition>;

/**
 * The order the Grid Geometry pull-down offers them in. Spelled out rather than
 * taken from the object literal's key order, so a geometry's place in the list
 * is a decision rather than an accident of how the map was typed.
 */
export const GRID_GEOMETRY_LIST: GridGeometryKind[] = [
  "rectangular",
  "isometric",
  "hexagonal",
  "octagonal",
];