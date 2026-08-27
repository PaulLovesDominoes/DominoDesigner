import { ReadOnlyField } from "../../../components/PropertyFields";
import type { StructureOperationEditorProps } from "../base";
import type { DominoGroupOperation } from "./object-model";

/**
 * A domino group's properties: how many dominoes are in it, and nothing else.
 *
 * Deliberately this thin. A group has no settings yet — the dominoes are put in
 * by placing them on the canvas, not by anything typed here — so the count is
 * all there is to say. It is a ReadOnlyField rather than a greyed number box
 * because it was never a value the dialog could have edited.
 *
 * Later releases are expected to fill this in: replicating a group, moving it,
 * making it conditional, giving it parameters. The dialog exists now so the
 * sidebar row's double-click and its ⋯ menu behave like every other operation's.
 */
export default function DominoGroupEditor({
  operation,
}: StructureOperationEditorProps<DominoGroupOperation>) {
  const count = operation.dominoes.length;
  return (
    <ReadOnlyField
      label="Contains"
      value={String(count)}
      unit={count === 1 ? "domino" : "dominoes"}
    />
  );
}