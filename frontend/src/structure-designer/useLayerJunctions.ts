import { useMemo } from "react";

import { OVERLAP_EPS_MM, pointInBoxFootprint } from "./operation-types/dominoGroup/overlap";
import { buildDominoSpaceIndex } from "./operation-types/dominoGroup/spaceIndex";
import { useDominoBoxes } from "./operation-types/dominoGroup/useDominoBoxes";
import { useJunctionPoints } from "./operation-types/gridDefinition/useJunctionPoints";
import { layerFloorMm } from "./operation-types/layerDefinition/layers";
import { useLayerHeights } from "./operation-types/layerDefinition/useLayerHeights";
import { useStructureStore } from "./store";

/**
 * The junctions of the layer being worked on, and which of them have a domino
 * standing on them.
 *
 * Such a junction is not somewhere another domino can be started, so the
 * placement tool puts no mark on one under the pointer and a press on one starts
 * nothing. **That mark is the whole of what this is for.** The dots themselves
 * are all drawn either way — a buried one is hidden by the domino on top of it
 * without anybody arranging it — but the mark is drawn with depth testing off so
 * that a domino standing in front cannot hide the junction being aimed at, which
 * means it would happily paint over the very domino that makes the junction
 * unusable.
 *
 * **Both halves are handed back, and the full list is the important one.** The
 * tool searches every junction, buried or not, so that a press over a buried one
 * is recognised as landing on that junction and quietly does nothing — where
 * searching the free ones alone would snap the press to whichever free junction
 * happened to be nearest, which could be some way from where the user pressed.
 *
 * This lives with the screen's own chrome rather than under gridDefinition/,
 * because the question mixes the grid with the dominoes standing on it and
 * neither folder owns both.
 */
export interface LayerJunctions {
  /** Every junction of this layer's grid, as x, y, x, y, … in mm. */
  points: Float32Array;
  /** One entry per junction: 1 when something is standing on it. */
  blocked: Uint8Array;
}

export function useLayerJunctions(): LayerJunctions {
  const layer = useStructureStore((s) => s.layer);
  const heights = useLayerHeights();
  const points = useJunctionPoints();
  const boxes = useDominoBoxes();
  const floorZ = layerFloorMm(heights, layer);

  return useMemo(() => {
    const blocked = new Uint8Array(points.length / 2);

    /*
     * Only the dominoes filling the space directly above this layer's floor can
     * bury one of its junctions.
     *
     * Written as two comparisons against the floor rather than as a test against
     * the layer number, which is what lets a domino reaching up from a course
     * below count: an upright is 48mm tall and a layer is often 24mm, so it fills
     * the layer above it and the one above that. A domino whose top lands exactly
     * on this floor is the opposite case and deliberately does not count — that
     * is a domino meant to be built on.
     */
    const straddling = boxes.filter(
      (box) => box.z0 <= floorZ + OVERLAP_EPS_MM && box.z1 > floorZ + OVERLAP_EPS_MM,
    );
    if (straddling.length === 0) return { points, blocked };

    // The one thing on this screen that needs an index rather than a walk — see
    // spaceIndex.ts, which is written for this pass and nothing else.
    const index = buildDominoSpaceIndex(straddling);

    for (let i = 0; i < blocked.length; i++) {
      const x = points[2 * i];
      const y = points[2 * i + 1];
      for (const candidate of index.near(x, y)) {
        if (pointInBoxFootprint(straddling[candidate], x, y)) {
          blocked[i] = 1;
          break;
        }
      }
    }

    return { points, blocked };
  }, [points, boxes, floorZ]);
}