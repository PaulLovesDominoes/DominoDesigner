import { useMemo } from "react";
import * as THREE from "three";

import DominoBatch from "./DominoBatch";
// Reaching into one operation type's folder from the screen's own chrome, the
// same way JunctionGrid does for the grid and LayerPlane does for layer heights.
// Routing this back through the registry would mean a hook on the operation
// contract with a single implementation dispatching to itself. The day a second
// kind of operation puts something permanent on the canvas — a tower, a wall —
// that hook becomes worth adding, and it would sit alongside `preview` in
// operation-types/base.ts as the "draw this always" to its "draw this while the
// dialog is open".
import { effectiveDominoGroup } from "./operation-types/dominoGroup/dominoes";
import { useDominoBoxes } from "./operation-types/dominoGroup/useDominoBoxes";
import { useStructureStore } from "./store";

/** The axis a domino is turned about: straight up, since the world is Z-up. */
const UP = new THREE.Vector3(0, 0, 1);

/**
 * Every domino placed in the structure.
 *
 * **Drawn whatever else is happening on screen**, and that is deliberate — note
 * that both of its neighbours in the scene do the opposite. JunctionGrid stops
 * drawing while an operation's properties are open, and StructurePreview draws
 * only then. This does neither: the dominoes *are* the structure, and the
 * properties dialog is modeless precisely so that what is being described stays
 * in view while it is described. Do not "fix" this into line with the other two.
 *
 * **Where each domino is comes from useDominoBoxes**, the same list the placement
 * tool tests against and a click picks out of. Working it out again here would be
 * a second copy of the arithmetic, and the drawn domino and the one that can be
 * clicked would be free to disagree.
 *
 * How this sits against the grey layer sheet needs no arranging and is worth
 * saying so it does not look like luck. Dominoes are solid and the sheet is
 * see-through with `depthWrite` off, so three.js draws all the solid things
 * first and then paints the sheet over them — which hides the dominoes *below*
 * the sheet while still letting the ones standing *on* it show through. That is
 * exactly what the sheet is semi-transparent for.
 */
export default function PlacedDominoes() {
  const operations = useStructureStore((s) => s.operations);
  const layer = useStructureStore((s) => s.layer);
  const hideDominoesAbove = useStructureStore((s) => s.hideDominoesAbove);
  const selectedDominoes = useStructureStore((s) => s.selectedDominoes);
  const boxes = useDominoBoxes();

  /*
   * One matrix per domino drawn, plus which domino of the group each of them is.
   *
   * The second list is what makes hiding the layers above harmless to everything
   * else: a selection is a set of positions in the *group*, and the batch knows
   * only its own drawn order, so something has to carry the map between them.
   *
   * Note this must be worked out with useMemo rather than read straight out of
   * the store: it builds fresh arrays every time, and a store selector that does
   * that re-renders for ever. The same rule useLayerHeights and useJunctionPoints
   * are both written up under.
   */
  const { matrices, drawnFrom } = useMemo(() => {
    const group = effectiveDominoGroup(operations);
    const matrices: THREE.Matrix4[] = [];
    const drawnFrom: number[] = [];
    if (!group) return { matrices, drawnFrom };

    const centre = new THREE.Vector3();
    const turn = new THREE.Quaternion();
    const size = new THREE.Vector3();

    for (let i = 0; i < group.dominoes.length && i < boxes.length; i++) {
      if (hideDominoesAbove && group.dominoes[i].layer > layer) continue;
      const box = boxes[i];
      centre.set(box.centreX, box.centreY, (box.z0 + box.z1) / 2);
      // compose() fills in one matrix from three separate facts: where the box
      // goes, how it is turned, and how big it is. A quaternion is three.js's way
      // of holding a rotation; this one is a turn about the upright axis by the
      // angle between the domino's two attachment points.
      turn.setFromAxisAngle(UP, Math.atan2(box.uY, box.uX));
      size.set(box.halfU * 2, box.halfV * 2, box.z1 - box.z0);
      matrices.push(new THREE.Matrix4().compose(centre, turn, size));
      drawnFrom.push(i);
    }

    return { matrices, drawnFrom };
  }, [operations, boxes, layer, hideDominoesAbove]);

  // The selection, said in the batch's own numbering. A domino that is selected
  // but not drawn — hidden because it stands above this layer — simply does not
  // appear here.
  const selectedInBatch = useMemo(() => {
    const inBatch = new Set<number>();
    for (let drawn = 0; drawn < drawnFrom.length; drawn++) {
      if (selectedDominoes.has(drawnFrom[drawn])) inBatch.add(drawn);
    }
    return inBatch;
  }, [drawnFrom, selectedDominoes]);

  return <DominoBatch matrices={matrices} selected={selectedInBatch} />;
}