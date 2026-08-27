import { DOMINO_SIZE } from "../../../dimensions";
import {
  DEFAULT_LAYER_HEIGHT_MM,
  LAYER_COUNT,
  MIN_LAYER,
} from "../../constants";
import type { StructureOperationBase, StructureOperationId } from "../base";
import { repeatSpan } from "../repeat";
import type {
  LayerDefinitionOperation,
  LayerHeightKind,
  LayerHeightRow,
} from "./object-model";

/**
 * Everything about turning layer definitions into a list of layer heights.
 *
 * Pure and free of React, so the eventual JSON exporter can use it too. It
 * imports only *types* from object-model.ts, which TypeScript erases at compile
 * time — so although the two files reference each other on paper, there is no
 * import cycle at run time and nothing here has to worry about being reached
 * before object-model.ts has finished evaluating.
 *
 * This deliberately is **not** reached through a registry hook on the operation
 * definition. Only one kind of operation defines layers and only one ever will,
 * so a hook would be an abstraction with a single implementation dispatching to
 * itself. The type check in `isLayerDefinition` sits inside this type's own
 * folder, which is why it isn't the "switch on a type outside the registry"
 * the repo-root CLAUDE.md warns about.
 */

/**
 * What each kind of layer height is worth, and how it is written in the Type
 * pull-down. The millimetres come from DOMINO_SIZE so a label can never drift
 * from the dimension it names.
 *
 * A standing domino's tall dimension is its *length*, so that is the word used
 * here. It is the layer that has a height; calling the domino's 48mm dimension
 * a height as well is how a 48 quietly becomes a 24.
 *
 * "Custom" carries no millimetres of its own — that is the one kind whose row
 * keeps a number the user typed. See `layerRowHeightMm`.
 */
export const LAYER_HEIGHT_KINDS = [
  { kind: "width", label: `Width (${DOMINO_SIZE.width}mm)`, mm: DOMINO_SIZE.width },
  { kind: "length", label: `Length (${DOMINO_SIZE.length}mm)`, mm: DOMINO_SIZE.length },
  {
    kind: "thickness",
    label: `Thickness (${DOMINO_SIZE.thickness}mm)`,
    mm: DOMINO_SIZE.thickness,
  },
  { kind: "custom", label: "Custom", mm: null },
] as const satisfies readonly {
  kind: LayerHeightKind;
  label: string;
  mm: number | null;
}[];

/** What a new Custom row starts at, before the user types anything. */
export const DEFAULT_CUSTOM_HEIGHT_MM = DEFAULT_LAYER_HEIGHT_MM;

/** The height in mm one row of the Layer Heights list stands for. */
export function layerRowHeightMm(row: LayerHeightRow): number {
  const kind = LAYER_HEIGHT_KINDS.find((k) => k.kind === row.kind);
  return kind?.mm ?? row.mm;
}

/** The rows with the one at `from` moved to sit at `to`. */
export function moveLayerRow(
  rows: readonly LayerHeightRow[],
  from: number,
  to: number,
): LayerHeightRow[] {
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  // Pulling the row out shifts everything after it down one, so a drop position
  // past the row's old home has to come down with them.
  next.splice(to > from ? to - 1 : to, 0, moved);
  return next;
}

/** Whether this operation is a layer definition — the narrowing this file needs. */
export function isLayerDefinition(
  operation: StructureOperationBase,
): operation is LayerDefinitionOperation {
  return operation.type === "layerDefinition";
}

/**
 * The heights this one definition contributes, given how many layers are still
 * unclaimed by the definitions before it.
 *
 * How far the Repeat setting reaches is `repeatSpan` in ../repeat.ts, which grid
 * definitions now stack by as well. What is left here is this type's own part:
 * one pass covers as many layers as the list has rows, and the heights are read
 * off it round and round.
 */
export function definitionLayerHeights(
  operation: LayerDefinitionOperation,
  remaining: number,
): number[] {
  const rowMm = operation.heights.map(layerRowHeightMm);
  const total = repeatSpan(
    operation.repeat,
    operation.repeatCount,
    rowMm.length,
    remaining,
  );

  const heights: number[] = [];
  for (let i = 0; i < total; i++) heights.push(rowMm[i % rowMm.length]);
  return heights;
}

/**
 * The height in mm of every layer, lowest first.
 *
 * Called with no `stopBefore` it returns LAYER_COUNT heights: every layer the
 * definitions reach, then DEFAULT_LAYER_HEIGHT_MM for the rest. That is what
 * the layer plane reads, and it is why a structure with no definitions at all
 * still has the layer spacing the screen has always had.
 *
 * Called with an operation's id it stops before that operation, so the result
 * is just the layers sitting *beneath* it, unpadded. Its length is how many
 * layers come first, and its total is the height that operation's first layer
 * starts at — which is everything the canvas preview and the warning need.
 * An id that is not in the list falls through to the padded whole-structure
 * answer, which is the right reading of "everything below something that isn't
 * there".
 */
export function layerHeights(
  operations: readonly StructureOperationBase[],
  stopBefore?: StructureOperationId,
): number[] {
  const heights: number[] = [];

  for (const operation of operations) {
    if (operation.id === stopBefore) return heights;
    if (!isLayerDefinition(operation)) continue;
    // Full up. Keep walking rather than breaking, because a later operation may
    // still be the one `stopBefore` names.
    if (heights.length >= LAYER_COUNT) continue;
    heights.push(...definitionLayerHeights(operation, LAYER_COUNT - heights.length));
  }

  while (heights.length < LAYER_COUNT) heights.push(DEFAULT_LAYER_HEIGHT_MM);
  return heights;
}

/** How far off the build plane the floor of `layer` sits, in mm. */
export function layerFloorMm(heights: readonly number[], layer: number): number {
  let z = 0;
  for (let i = 0; i < layer - MIN_LAYER && i < heights.length; i++) z += heights[i];
  return z;
}

/**
 * The floor of every layer, lowest first — one height per layer.
 *
 * **There is deliberately no entry for the top layer's ceiling.** The layer
 * slider stops at the top layer, and what it points at is that layer's *floor*,
 * which is where its solid sheet is drawn. A sheet above that marks a boundary
 * nothing else on the screen can reach, and reads as one layer too many.
 */
export function layerFloors(heights: readonly number[]): number[] {
  const floors: number[] = [];
  let z = 0;
  for (const height of heights) {
    floors.push(z);
    z += height;
  }
  return floors;
}

const PRIOR_FOREVER_WARNING =
  "WARNING: A prior layer definition repeats forever, and so this layer definition will have no effect.";

const ABOVE_LIMIT_WARNING =
  "WARNING: The layer definitions before this one already reach the top layer, so this layer definition will have no effect.";

/**
 * Why this definition has no effect where it sits, or undefined when it does
 * have one.
 *
 * There are two ways to be squeezed out and they want different sentences: an
 * earlier definition repeating without end, or earlier definitions simply
 * counting their way to the last layer. Both are read off the same
 * `layerHeights` call the preview uses, so a row can never be reddened for a
 * reason the canvas contradicts.
 */
export function layerDefinitionWarning(
  operation: LayerDefinitionOperation,
  operations: readonly StructureOperationBase[],
): string | undefined {
  const below = layerHeights(operations, operation.id);
  if (below.length < LAYER_COUNT) return undefined;

  // Only a definition that actually contributed layers can be the one that
  // squeezed this out. An empty list defines nothing however it is set to
  // repeat, and blaming it would name the wrong culprit when the real cause was
  // an earlier definition counting its way to the top.
  const repeatsForever = operations
    .slice(0, operations.findIndex((o) => o.id === operation.id))
    .some(
      (o) => isLayerDefinition(o) && o.repeat === "forever" && o.heights.length > 0,
    );

  return repeatsForever ? PRIOR_FOREVER_WARNING : ABOVE_LIMIT_WARNING;
}