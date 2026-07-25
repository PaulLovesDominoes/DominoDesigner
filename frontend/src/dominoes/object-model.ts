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
 * for the element's life (hidden tombstones, never swap-removed), which is what
 * a future op/undo stack will lean on.
 */
export interface DominoData {
  /** allocated domino slots */
  capacity: number;
  /** dominoes in use (including hidden) */
  count: number;
  /**
   * stride 3: x,y,z per domino, parent-relative mm. z is unused this version
   * (always 0); it is kept for later element types that stack into +Z.
   */
  positions: Float32Array;
  /** ORIENTATION per domino */
  orientations: Uint8Array;
  /** stride 3: r,g,b 0..255 per domino */
  colors: Uint8Array;
  /** 1 = hidden/deleted, 0 = visible */
  hidden: Uint8Array;
}

/**
 * The colour every domino starts out as. Per-domino colouring is a later
 * feature — this version renders them all this colour — but the column is
 * per-domino already, so nothing has to change when it lands.
 */
export const DEFAULT_DOMINO_COLOR = [0x33, 0x33, 0x33] as const;

/**
 * Allocate space for `count` dominoes: origin position, STANDING (0), the
 * default colour, visible. Deliberately imposes NO layout — the parent element
 * writes the positions afterward.
 */
export function generateDominoes(count: number): DominoData {
  const colors = new Uint8Array(count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = DEFAULT_DOMINO_COLOR[0];
    colors[i + 1] = DEFAULT_DOMINO_COLOR[1];
    colors[i + 2] = DEFAULT_DOMINO_COLOR[2];
  }

  return {
    capacity: count,
    count,
    positions: new Float32Array(count * 3),
    orientations: new Uint8Array(count),
    colors,
    hidden: new Uint8Array(count),
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
 * Bounding box of the visible dominoes' positions (parent-relative), or null if
 * there are none. Generic across parent element types — it reads the data, not
 * any grid parameters — so any element can derive a footprint from its dominoes.
 */
export function extent(data: DominoData): Extent | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < data.count; i++) {
    if (data.hidden[i]) continue;
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
