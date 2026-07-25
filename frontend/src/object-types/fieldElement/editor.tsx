import {
  CheckboxField,
  NumberField,
  SelectField,
  Separator,
} from "../../components/PropertyFields";
import { UnitNumberField } from "../../components/UnitNumberField";
import { fromMm } from "../../units";
import type { DDObjectEditorProps } from "../base";
import { 
  normalizeField,
  type FieldElementDDObject, 
  withDisplayHeight, 
  withDisplayPosition, 
  withDisplayUnit, 
  withDisplayWidth } from "./object-model";

const MIN_SIZE_MM = 1;

/**
 * Standard domino spacings (mm of clear gap), offered as a pull-down over the
 * raw "Domino spacing" number below. These are UI presets, not layout geometry —
 * they map a friendly name onto a `domino_spacing` value and nothing more, so
 * they live with the editor rather than the object model.
 */
const SPACING_PRESETS = [
  { name: "Lego", value: 8 },
  { name: "H5", value: 8.5 },
  { name: "H5-Disney", value: 12.5 },
  { name: "Bulk", value: 12.75 },
] as const;

const CUSTOM = "Custom";

const PRESET_OPTIONS = [...SPACING_PRESETS.map((p) => p.name), CUSTOM];
// domino_spacing is a float; compare with a tolerance rather than for equality.

const SPACING_EPS = 1e-6;

/** The preset matching a spacing, or "Custom" when none does. */
const presetFor = (spacing: number) =>
  SPACING_PRESETS.find((p) => Math.abs(p.value - spacing) < SPACING_EPS)?.name ??
  CUSTOM;

/**
 * Property controls for a domino field. Reached only through
 * fieldElementDefinition.editor. Every control previews live on the canvas.
 *
 * A field is described twice over — physically, and by domino counts — and
 * `fixed_size` picks which description the user drives. The other is derived
 * and shown disabled, so the consequence of an edit is always visible.
 */
export default function FieldElementEditor({
  ddObject,
  update,
}: DDObjectEditorProps<FieldElementDDObject>) {
  // Every edit goes through normalizeField, so the store never holds a field
  // whose size and counts disagree.
  const set = (patch: Partial<FieldElementDDObject>) =>
    update(normalizeField({ ...ddObject, ...patch }));
  const sizeIsDerived = !ddObject.fixed_size;
  const minDisplay = fromMm(MIN_SIZE_MM, ddObject.displayUnit);

  return (
    <>
      <NumberField
        label="Rows"
        value={ddObject.rows}
        min={1}
        step={1}
        disabled={ddObject.fixed_size}
        onChange={(rows) => set({ rows })}
      />
      <NumberField
        label="Dominoes/row"
        value={ddObject.dominoes_per_row}
        min={1}
        step={1}
        disabled={ddObject.fixed_size}
        onChange={(dominoes_per_row) => set({ dominoes_per_row })}
      />

      {/* Both spacings are the clear gap between neighbours, not centre-to-
          centre pitch — the domino's own footprint is added on top. */}
      <NumberField
        label="Row spacing"
        value={ddObject.row_spacing}
        unit="mm"
        float
        onChange={(row_spacing) => set({ row_spacing })}
      />
      {/* Selecting a preset writes its spacing; the selection is derived from
          the current spacing, so typing a value below flips this to match (or to
          "Custom"). Choosing "Custom" is a no-op — it only ever displays. */}
      <SelectField
        label="Spacing preset"
        value={presetFor(ddObject.domino_spacing)}
        options={PRESET_OPTIONS}
        onChange={(name) => {
          const preset = SPACING_PRESETS.find((p) => p.name === name);
          if (preset) set({ domino_spacing: preset.value });
        }}
      />
      <NumberField
        label="Domino spacing"
        value={ddObject.domino_spacing}
        unit="mm"
        float
        onChange={(domino_spacing) => set({ domino_spacing })}
      />

      <Separator />

      {/* Checked: the physical size holds and the counts refit to it. Unchecked:
          the counts hold and the size grows to contain them exactly. */}
      <CheckboxField
        label="Use Physical Size"
        value={ddObject.fixed_size}
        onChange={(fixed_size) => set({ fixed_size })}
      />

      <UnitNumberField
        label="Width"
        value={ddObject.displayWidth}
        min={minDisplay}
        unit={ddObject.displayUnit}
        disabled={sizeIsDerived}
        onUnitChange={(unit) => update(withDisplayUnit(ddObject, unit))}
        onChange={(width) => set(withDisplayWidth(ddObject, width))}
      />
      <UnitNumberField
        label="Height"
        value={ddObject.displayHeight}
        min={minDisplay}
        unit={ddObject.displayUnit}
        disabled={sizeIsDerived}
        onUnitChange={(unit) => update(withDisplayUnit(ddObject, unit))}
        onChange={(height) => set(withDisplayHeight(ddObject, height))}
      />

      {/* Position is the field's lower-left corner, measured from the build
          plane's lower-left corner. */}
       <UnitNumberField
         label="Position X"
         value={ddObject.displayPosition.x}
         min={0}
         unit={ddObject.displayUnit}
         onUnitChange={(unit) => update(withDisplayUnit(ddObject, unit))}
         onChange={(x) => update(withDisplayPosition(ddObject, { ...ddObject.displayPosition, x }))}
       /> 
       <UnitNumberField
         label="Position Y"
         value={ddObject.displayPosition.y}
         min={0}
         unit={ddObject.displayUnit}
         onUnitChange={(unit) => update(withDisplayUnit(ddObject, unit))}
         onChange={(y) => update(withDisplayPosition(ddObject, { ...ddObject.displayPosition, y }))}
       />

    </>
  );
}
