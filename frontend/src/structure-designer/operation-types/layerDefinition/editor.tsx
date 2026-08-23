import {
  NumberField,
  SectionHeader,
  SelectField,
} from "../../../components/PropertyFields";
import type { StructureOperationEditorProps } from "../base";
import { LAYER_REPEAT_KINDS } from "./layers";
import LayerHeightList from "./LayerHeightList";
import type { LayerDefinitionOperation, LayerRepeatKind } from "./object-model";

/**
 * A layer definition's properties: the heights of the layers it describes, and
 * how many times that list runs.
 *
 * Everything here writes straight through to the store on each change, so the
 * canvas preview follows as it is typed. The dialog around it owns Create /
 * Update and Cancel, so this holds no draft of its own.
 */
export default function LayerDefinitionEditor({
  operation,
  update,
}: StructureOperationEditorProps<LayerDefinitionOperation>) {
  const repeatLabel =
    LAYER_REPEAT_KINDS.find((r) => r.kind === operation.repeat)?.label ?? "";

  return (
    <>
      <SectionHeader>Layer Heights</SectionHeader>
      <LayerHeightList
        heights={operation.heights}
        onChange={(heights) => update({ heights })}
      />

      <SelectField
        label="Repeat"
        value={repeatLabel}
        options={LAYER_REPEAT_KINDS.map((r) => r.label)}
        onChange={(label) => {
          const repeat = LAYER_REPEAT_KINDS.find((r) => r.label === label);
          if (repeat) update({ repeat: repeat.kind as LayerRepeatKind });
        }}
      />

      {/*
        The count only means anything in Count mode, so it is hidden rather than
        disabled in the other two — there is nothing to read off a greyed box
        whose value is not being used. Once is Count = 1, and Forever runs to the
        top of the structure.
      */}
      {operation.repeat === "count" && (
        <NumberField
          label="Times"
          value={operation.repeatCount}
          min={1}
          step={1}
          unit="times"
          onChange={(repeatCount) => update({ repeatCount })}
        />
      )}
    </>
  );
}