/**
 * Generic per-domino data, shared by every element type that owns dominoes
 * (fields today; walls, towers, lines later). Deliberately knows nothing about
 * grids or fields — it only stores dominoes and lets the parent element decide
 * how they are arranged.
 *
 * Stored as a Structure of Arrays (one flat typed array per attribute) because
 * that is what an InstancedMesh consumes and because tens of thousands of
 * dominoes must cost no per-object allocation. See dominoes/store.ts for the
 * mutation discipline.
 */

/**
 * How a domino sits. 0 = standing (upright, length runs +Z), 1 = sideways,
 * 2 = flat (lying on a broad face). Sideways and flat are unused this version —
 * every generated domino is STANDING — but the column exists so parent elements
 * can set them later without a data migration.
 */
export const ORIENTATION = { STANDING: 0, SIDEWAYS: 1, FLAT: 2 } as const;

/**
 * Per-domino columns for one parent element. Buffers are mutated in place; the
 * store bumps a version counter to signal consumers. Domino indices are stable
 * for the element's life — nothing ever compacts or swap-removes a buffer — which
 * is what the operation/undo stack leans on when it names "domino 4812".
 */
export interface DominoData {
  /** allocated domino slots */
  capacity: number;
  /** dominoes in use */
  count: number;
  /**
   * stride 3: x,y,z per domino, parent-relative mm. z is unused this version
   * (always 0); it is kept for later element types that stack into +Z.
   */
  positions: Float32Array;
  /** ORIENTATION per domino */
  orientations: Uint8Array;
  /**
   * A domino's assigned color, as the *numericId* of a domino-inventory
   * entry (InventoryEntry.numericId) — a live reference, not a baked-in RGB
   * copy, so editing an inventory color's RGB or deleting it is immediately
   * reflected wherever it's painted (see colorLookupStore.ts, which
   * resolves this to actual pixels at draw time). 0 is a sentinel meaning
   * "unpainted" (rendered as DEFAULT_DOMINO_COLOR) — never a real id, since
   * inventory ids start at 1. Values at or above HIDDEN_COLOR_FLAG carry the
   * hidden bit over the id the domino returns to; see below.
   */
  colorIds: Uint32Array;
}

/**
 * The colour an unpainted domino (colorIds[i] === 0, or a colorId whose
 * inventory entry has since been deleted) renders as.
 */
export const DEFAULT_DOMINO_COLOR: readonly [number, number, number] = [0xBB, 0xBB, 0xBB];

/**
 * Hiding a domino is stored as a flag *over* its colorId rather than in a column
 * of its own, so it inherits every mechanism a colorId already has for free:
 * undo/redo, the mode's cancel snapshot, the clipboard, and colorMemory's
 * survival across a regenerate all move colorIds around opaquely and needed no
 * changes for hiding to work through them.
 *
 * Two consequences worth knowing before touching any of the predicates that
 * read colorIds:
 *
 * - **Painting unhides, with no code to make it so.** Every write path stores a
 *   raw inventory numericId, or 0 to unpaint — all far below the flag — so
 *   assigning any color to a hidden domino clears the hidden bit as a side
 *   effect. A hidden domino's low bits are therefore frozen: they are the color
 *   it returns to, and nothing but unhiding can reveal them.
 * - **"Visible dominoes of color X" is plain equality**, needing no masking:
 *   a hidden value can never equal a small numericId or 0.
 *
 * Use arithmetic, never `|`/`&`. JS bitwise operators coerce to *signed* int32.
 * This flag sits safely below 2^31 so `|` would happen to work today, but a
 * wider flag would silently produce a negative, wrap on the way into the
 * Uint32Array, and then compare false against the unsigned value read back —
 * breaking commitDominoColors' "already this color" early-out. `+`/`-` has no
 * such cliff.
 */
export const HIDDEN_COLOR_FLAG = 0x40000000;

export const isHiddenColorId = (colorId: number) => colorId >= HIDDEN_COLOR_FLAG;

export const withHiddenColorId = (colorId: number) =>
  isHiddenColorId(colorId) ? colorId : colorId + HIDDEN_COLOR_FLAG;

export const withoutHiddenColorId = (colorId: number) =>
  isHiddenColorId(colorId) ? colorId - HIDDEN_COLOR_FLAG : colorId;

/**
 * Allocate space for `count` dominoes: origin position, STANDING (0),
 * unpainted (colorId 0). Deliberately imposes NO layout — the parent element
 * writes the positions afterward.
 */
export function generateDominoes(count: number): DominoData {
  return {
    capacity: count,
    count,
    positions: new Float32Array(count * 3),
    orientations: new Uint8Array(count),
    colorIds: new Uint32Array(count), // zero-initialized = unpainted
  };
}

/** Axis-aligned footprint on the build plane, in mm, parent-relative. */
export interface Extent {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of the dominoes' positions (parent-relative), or null if there
 * are none. Generic across parent element types — it reads the data, not any
 * grid parameters — so any element can derive a footprint from its dominoes.
 */
export function extent(data: DominoData): Extent | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < data.count; i++) {
    const x = data.positions[3 * i];
    const y = data.positions[3 * i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A cardinal direction on the build plane, used by domino-editing arrow-key navigation. */
export type Direction = "+x" | "-x" | "+y" | "-y";

// Sub-millimetre slop so a domino at (nearly) the same coordinate as the
// reference isn't treated as strictly "beyond" it by floating point noise.
const DIRECTION_EPSILON = 1e-6;

/**
 * The domino nearest `fromIndex` strictly in `direction` (parent-relative mm),
 * or undefined if none exists. Nearest on the primary axis, ties broken by
 * nearest on the other. For today's row/column field this is exactly "the
 * adjacent cell in that direction" — but it makes no grid assumption, reading
 * only positions, so a future non-grid layout (a spiral, concentric rings) gets
 * reasonable arrow-key stepping for free instead of needing its own navigation
 * logic.
 */
export function nearestInDirection(
  data: DominoData,
  fromIndex: number,
  direction: Direction,
): number | undefined {
  const axis = direction === "+x" || direction === "-x" ? 0 : 1;
  const sign = direction === "+x" || direction === "+y" ? 1 : -1;
  const perpAxis = axis === 0 ? 1 : 0;

  const refPrimary = data.positions[3 * fromIndex + axis];
  const refPerp = data.positions[3 * fromIndex + perpAxis];

  let bestIndex: number | undefined;
  let bestPrimaryDelta = Infinity;
  let bestPerpDelta = Infinity;

  for (let i = 0; i < data.count; i++) {
    if (i === fromIndex) continue;
    const primary = data.positions[3 * i + axis];
    const primaryDelta = (primary - refPrimary) * sign;
    if (primaryDelta <= DIRECTION_EPSILON) continue;

    const perpDelta = Math.abs(data.positions[3 * i + perpAxis] - refPerp);
    if (
      primaryDelta < bestPrimaryDelta - DIRECTION_EPSILON ||
      (Math.abs(primaryDelta - bestPrimaryDelta) <= DIRECTION_EPSILON && perpDelta < bestPerpDelta)
    ) {
      bestIndex = i;
      bestPrimaryDelta = primaryDelta;
      bestPerpDelta = perpDelta;
    }
  }

  return bestIndex;
}
