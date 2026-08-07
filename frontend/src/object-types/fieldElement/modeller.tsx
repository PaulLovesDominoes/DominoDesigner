import { useEffect } from "react";

import { generateDominoes, type DominoData } from "../../dominoes/object-model";
import { DominoModeller } from "../../dominoes/modeller";
import { useDominoDataStore } from "../../dominoes/store";
import { restoreDominoColors } from "../../dominoes/colorMemory";
import type { DDObjectModellerProps } from "../base";
import { gridBaseLocal, pitchX, pitchY, type FieldElementDDObject } from "./object-model";

/**
 * The field-specific half of the domino system: it decides *where* a field's
 * dominoes go (their positions and orientations) and writes them into the
 * dominoes store; the shared DominoModeller draws them. The store knows only how
 * to hold dominoes, so each parent element type owns its own layout. This is the
 * template a new domino-producing type follows — compute a layout, put() it,
 * render <DominoModeller>. The pitches come from the object model, shared with
 * the counts↔size maths so the grid laid out here and the span normalizeField
 * computes for the same counts can never drift apart. They are not always the
 * same rectangle, though: a handle-drag deliberately leaves the boundary a
 * sub-pitch gap outside the outermost dominoes (see object-model.ts).
 */
type FieldLayout = Pick<
  FieldElementDDObject,
  | "rows" | "dominoes_per_row" | "row_spacing" | "domino_spacing"
  | "position" | "anchorX" | "anchorY" | "originRow" | "originCol"
>;

function layoutField(field: FieldLayout): DominoData {
  const { rows, dominoes_per_row, row_spacing, domino_spacing } = field;
  const data = generateDominoes(rows * dominoes_per_row);

  const px = pitchX(domino_spacing);
  const py = pitchY(row_spacing);

  // Where the row 0 / col 0 domino goes. Anchored to anchorX/anchorY offset by
  // originCol/originRow — how many columns/rows now sit before the anchor after
  // bottom/left handle-drags — and NOT to `position`, which is only the
  // boundary rectangle. That is exactly what keeps an existing domino still
  // while the box is resized around it. gridBaseLocal is the shared definition,
  // used by normalizeField and snapShapePoint too, so the three cannot drift.
  const { x: baseX, y: baseY } = gridBaseLocal(field);

  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < dominoes_per_row; col++) {
      // z stays 0 — unused this version. Orientation is left at the
      // generated default (STANDING).
      data.positions[3 * i] = baseX + col * px;
      data.positions[3 * i + 1] = baseY + row * py;
      i++;
    }
  }

  return data;
}

/**
 * Reached only through fieldElementDefinition.modeller. Regenerates the field's
 * dominoes when a layout parameter changes, then hands drawing to the shared
 * DominoModeller.
 */
export default function FieldElementModeller({
  ddObject,
}: DDObjectModellerProps<FieldElementDDObject>) {
  const put = useDominoDataStore((s) => s.put);

  const {
    id, rows, dominoes_per_row, row_spacing, domino_spacing,
    position, anchorX, anchorY, originRow, originCol,
  } = ddObject;

  // Regenerate the dominoes whenever the field changes. `ddObject` alone is the
  // dependency that matters — every layout parameter is destructured from it,
  // and the store hands back a fresh object identity on every write, so listing
  // them individually would imply a precision this effect doesn't have.
  //
  // A pure move (position changes but anchorX/anchorY shift by the same delta,
  // per setBounds' no-resize branch) recomputes to the same local positions, so
  // it is a harmless no-op recompute rather than a case needing special
  // handling.
  useEffect(() => {
    const data = layoutField({
      rows, dominoes_per_row, row_spacing, domino_spacing,
      position, anchorX, anchorY, originRow, originCol,
    });
    // Restores colorIds for any cell this field has painted before (surviving
    // a screen-switch remount, a resize, or an undo/redo of either) — see
    // dominoes/colorMemory.ts. A no-op the first time a field is ever laid out.
    restoreDominoColors(ddObject, data);
    put(id, data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [put, id, ddObject]);

  return <DominoModeller ddObjectId={id} position={ddObject.position} />;
}
