import { ColorField } from "../../components/PropertyFields";
import { UnitNumberField } from "../../components/UnitNumberField";
import { fromMm } from "../../units";
import type { DDObjectEditorProps } from "../base";
import { withDisplayHeight, withDisplayUnit, withDisplayWidth, type BuildPlaneDDObject } from "./object-model";

// The plane's real minimum (1mm) expressed in whatever unit is currently
// selected — UnitNumberField's `min` is in display-unit space, not mm.
const MIN_SIZE_MM = 1;

/**
 * Property controls for the build plane. Reached only through
 * buildPlaneDefinition.editor — the dialog resolves it from the registry.
 * The Name field is supplied by the dialog itself.
 */
export default function BuildPlaneEditor({
  ddObject,
  update,
}: DDObjectEditorProps<BuildPlaneDDObject>) {
  const minDisplay = fromMm(MIN_SIZE_MM, ddObject.displayUnit);

  return (
    <>
      <UnitNumberField
        label="Width"
        value={ddObject.displayWidth}
        min={minDisplay}
        unit={ddObject.displayUnit}
        onUnitChange={(unit) => update(withDisplayUnit(ddObject, unit))}
        onChange={(width) => update(withDisplayWidth(ddObject, width))}
      />
      <UnitNumberField
        label="Height"
        value={ddObject.displayHeight}
        min={minDisplay}
        unit={ddObject.displayUnit}
        onUnitChange={(unit) => update(withDisplayUnit(ddObject, unit))}
        onChange={(height) => update(withDisplayHeight(ddObject, height))}
      />
      <ColorField
        label="Color"
        value={ddObject.color}
        onChange={(color) => update({ color })}
      />
    </>
  );
}