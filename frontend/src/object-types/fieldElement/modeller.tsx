import { useEffect } from "react";

import { DOMINO_SIZE } from "../../dimensions";
import { generateDominoes, type DominoData } from "../../dominoes/object-model";
import { DominoModeller } from "../../dominoes/modeller";
import { useDominoDataStore } from "../../dominoes/store";
import type { DDObjectModellerProps } from "../base";
import { pitchX, pitchY, type FieldElementDDObject } from "./object-model";

/**
 * The field-specific half of the domino system: it decides *where* a field's
 * dominoes go (their positions and orientations) and writes them into the
 * dominoes store; the shared DominoModeller draws them. The store knows only how
 * to hold dominoes, so each parent element type owns its own layout. This is the
 * template a new domino-producing type follows — compute a layout, put() it,
 * render <DominoModeller>. The pitches come from the object model, shared with
 * the size↔counts maths so a laid-out field always occupies exactly the span
 * normalizeField computed for it.
 */
type FieldLayout = Pick<
  FieldElementDDObject,
  "rows" | "dominoes_per_row" | "row_spacing" | "domino_spacing"
>;

function layoutField(field: FieldLayout): DominoData {
  const { rows, dominoes_per_row, row_spacing, domino_spacing } = field;
  const data = generateDominoes(rows * dominoes_per_row);

  const px = pitchX(domino_spacing);
  const py = pitchY(row_spacing);

  let i = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < dominoes_per_row; col++) {
      // Positions are parent-relative; DominoModeller's group applies the field's
      // own position. z stays 0 — unused this version. Orientation is left at the
      // generated default (STANDING).
      data.positions[3 * i] = DOMINO_SIZE.thickness / 2 + col * px;
      data.positions[3 * i + 1] = DOMINO_SIZE.width / 2 + row * py;
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

  const { id, rows, dominoes_per_row, row_spacing, domino_spacing } = ddObject;

  // Regenerate the dominoes whenever a layout parameter changes. The field's
  // position is deliberately not a dependency — it moves the group, not the
  // dominoes. Per-domino edits don't exist yet, so a full rebuild is free of
  // consequences; that changes when the op/undo stack lands.
  useEffect(() => {
    put(id, layoutField({ rows, dominoes_per_row, row_spacing, domino_spacing }));
  }, [put, id, rows, dominoes_per_row, row_spacing, domino_spacing]);

  return <DominoModeller ddObjectId={id} position={ddObject.position} />;
}