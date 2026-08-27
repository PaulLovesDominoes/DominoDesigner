import { SectionHeader } from "../../../components/PropertyFields";
import type { StructureOperationEditorProps } from "../base";
import RepeatField from "../RepeatField";
import LayerHeightList from "./LayerHeightList";
import type { LayerDefinitionOperation } from "./object-model";

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
  return (
    <>
      <SectionHeader>Layer Heights</SectionHeader>
      <LayerHeightList
        heights={operation.heights}
        onChange={(heights) => update({ heights })}
      />

      {/* The mode and the count are one row, the count sitting to the right of
          the pull-down with no label between them — see RepeatField. */}
      <RepeatField
        label="Repeat"
        repeat={operation.repeat}
        count={operation.repeatCount}
        onChange={update}
      />
    </>
  );
}