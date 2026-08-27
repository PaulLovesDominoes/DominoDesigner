import { useMemo } from "react";

import { useStructureStore } from "../../store";
import type { StructureOperationBase } from "../base";
import { layerFloorMm, layerHeights } from "../layerDefinition/layers";
import { effectiveDominoGroup } from "./dominoes";
import { dominoBox, type DominoBox } from "./overlap";

/**
 * Every placed domino as a solid in space, in the group's own order — so entry
 * `i` here is `group.dominoes[i]`, which is what lets a selection be a set of
 * numbers.
 *
 * Several separate things want this list: the drawing, to know where to put each
 * domino; the placement tool, to refuse one that would run into another; the
 * junction mark, to know which junctions are buried; the rubber band, to work out
 * what it has caught; and a click, to work out what it landed on.
 *
 * **Hence the cache below, which sits outside React rather than in a useMemo.**
 * A useMemo belongs to one component, so several of them would each build their
 * own copy — and at the tens of thousands of dominoes a real structure reaches,
 * that is tens of thousands of objects allocated several times over on every
 * placement. A module-level cache is what makes them all share one list.
 *
 * The only thing compared is `operations`, which the store hands back as a new
 * array when the structure has been edited — a domino placed or deleted very
 * much included — and as the same one otherwise. The layer heights are worked out
 * from it here rather than passed in, deliberately:
 * `useLayerHeights` gives each component its own array of equal numbers, so
 * comparing those by identity would miss every time and the cache would never
 * hit.
 *
 * Like useLayerHeights and useJunctionPoints, **this must never be written as a
 * store selector.** It hands back an array, and although the cache means it is
 * usually the *same* array, "usually" is not what a selector needs; the first
 * change would re-render, rebuild, and the component would be looping before the
 * cache could settle it.
 */

let cachedOperations: readonly StructureOperationBase[] | null = null;
let cachedBoxes: DominoBox[] = [];

/**
 * The boxes for one list of operations.
 *
 * Rebuilt when `operations` is not the array it was on the last call, and handed
 * back unchanged otherwise.
 *
 * **Placing or deleting a single domino counts**, which is what makes that the
 * right test rather than a coincidence. Every write to the structure builds a new
 * `operations` array, and one that touches a group's dominoes builds a new group
 * object inside it too — the store has no other way of writing, since a value
 * changed in place would leave React and every cache here with no way to notice.
 * So the array being the one it was means every domino is where it was.
 */
export function placedDominoBoxes(
  operations: readonly StructureOperationBase[],
): DominoBox[] {
  if (operations === cachedOperations) return cachedBoxes;

  const group = effectiveDominoGroup(operations);
  const heights = layerHeights(operations);
  const boxes = group
    ? group.dominoes.map((domino) =>
        dominoBox(domino, layerFloorMm(heights, domino.layer)),
      )
    : [];

  cachedOperations = operations;
  cachedBoxes = boxes;
  return boxes;
}

export function useDominoBoxes(): DominoBox[] {
  const operations = useStructureStore((s) => s.operations);
  return useMemo(() => placedDominoBoxes(operations), [operations]);
}