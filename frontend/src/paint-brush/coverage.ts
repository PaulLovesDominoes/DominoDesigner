import type { DominoData } from "../dominoes/object-model";
import type { DominoBrushDefinition } from "./base";

/**
 * Every domino whose centre is under the nib, with the nib centred on
 * `centerX`/`centerY` — parent-relative mm, the space DominoData.positions
 * lives in.
 *
 * Ascending, and that matters: DominoEditor compares this against the previous
 * frame's list element by element to skip a redraw when the nib swept nothing
 * new.
 *
 * Deliberately a second copy of shape-select/dispatcher.ts's `indicesInShape`
 * loop rather than a shared generic. The two registries erase different
 * definition types and their `contains` signatures differ (a brush takes a size,
 * a shape takes its gesture state), so sharing would cost more machinery than
 * the eight lines it saves.
 */
export function indicesUnderBrush(
  definition: DominoBrushDefinition,
  sizeMm: number,
  centerX: number,
  centerY: number,
  data: DominoData,
): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.count; i++) {
    const dx = data.positions[3 * i] - centerX;
    const dy = data.positions[3 * i + 1] - centerY;
    if (definition.contains(sizeMm, dx, dy)) result.push(i);
  }
  return result;
}