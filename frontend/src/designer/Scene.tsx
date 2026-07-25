import { useStore } from "../store";
import { getDDObjectModeller } from "../object-types/registry";
import type { DDObjectId } from "../object-types/base";

/**
 * Draws one DDObject, then recurses into its children. The modeller comes from
 * the type registry, so a new DDObject type appears on the canvas by declaring a
 * `modeller` — types without one are simply skipped.
 */
function SceneObject({ ddObjectId }: { ddObjectId: DDObjectId }) {
  const ddObject = useStore((s) => s.ddObjects[ddObjectId]);
  if (!ddObject) return null;

  const Modeller = getDDObjectModeller(ddObject.type);
  const children = "children" in ddObject ? ddObject.children : [];

  return (
    <>
      {Modeller && <Modeller ddObject={ddObject} />}
      {children.map((childId) => (
        <SceneObject key={childId} ddObjectId={childId} />
      ))}
    </>
  );
}

/**
 * The build's contents, traversed from the root BuildPlane down. Must stay
 * inside the <Canvas>: the store subscriptions live here, and R3F's reconciler
 * is what repaints the `frameloop="demand"` canvas when they fire.
 */
export default function Scene() {
  const rootId = useStore((s) => s.rootId);
  return <SceneObject ddObjectId={rootId} />;
}