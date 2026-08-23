import { getOperationPreview } from "./operation-types/registry";
import { useStructureStore } from "./store";

/**
 * Draws whatever the operation being edited wants to show, and nothing the rest
 * of the time.
 *
 * Registry-driven, like the Designer's scene walker: it looks the preview up by
 * the operation's type and knows nothing about any particular one. An operation
 * type with nothing to show simply declares no preview and is skipped.
 *
 * It owns the one store subscription and hands the whole operation list down, so
 * a preview is a plain function of what it is given — which is also what keeps
 * preview modules out of the store's import graph. It lives inside the <Canvas>,
 * so its subscriptions are what drive the repaint.
 */
export default function StructurePreview() {
  const modifyingOperationId = useStructureStore((s) => s.modifyingOperationId);
  const operations = useStructureStore((s) => s.operations);

  if (!modifyingOperationId) return null;

  const operation = operations.find((o) => o.id === modifyingOperationId);
  if (!operation) return null;

  const Preview = getOperationPreview(operation.type);
  if (!Preview) return null;

  return <Preview operation={operation} operations={operations} />;
}