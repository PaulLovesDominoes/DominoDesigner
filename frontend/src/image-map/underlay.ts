import { useStore } from "../store";
import type { DDObjectId } from "../object-types/base";
import { UNPAINTED_TOP_Z } from "./object-model";

/**
 * How tall an unpainted domino should currently be drawn.
 *
 * This is the whole of the "below" layer. The picture has to hide the dominoes
 * that have no colour yet while the ones that do stand in front of it — but
 * every domino is exactly the same height, so no single height for the picture
 * does both. Squashing the unpainted ones makes room.
 *
 * It costs nothing visually: the camera is orthographic and looks straight down,
 * so a shorter domino covers exactly the same pixels. All that changes is which
 * of them ends up in front of the picture.
 *
 * Read by dominoes/modeller.tsx, which is the shared drawing half for every
 * element type — hence a plain id in and a number out, with nothing about images
 * in the signature.
 *
 * Imperative on purpose, like dominoes/expansion.ts's resolveDominoExpansion:
 * subscribe to the values it reads (`imageMaps[id]`, `dominoEditingId`,
 * `imageMapActive`) and call this, rather than calling it inside a selector.
 */
export function resolveUnpaintedTopZ(ddObjectId: DDObjectId): number | null {
  const s = useStore.getState();
  if (!s.imageMapActive || s.dominoEditingId !== ddObjectId) return null;
  const image = s.imageMaps[ddObjectId];
  if (!image || !image.visible || image.layer !== "below") return null;
  return UNPAINTED_TOP_Z;
}