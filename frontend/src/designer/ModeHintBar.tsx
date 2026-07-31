import type { ReactNode } from "react";

import { useStore } from "../store";
import { getDDObjectDefaultName } from "../object-types/registry";
import type { ToolId } from "../types";
import styles from "./ModeHintBar.module.css";

/**
 * What each placement tool asks the user to do. Adding a placement tool means
 * adding an entry here, not editing this component's markup. Two ToolIds are
 * deliberately absent: "select" gets its own idle hint below (depends on
 * whether any DDObjects exist yet, not a fixed string), and "editDominoes"
 * gets its own richer, button-bearing bar instead of a plain hint string.
 */
const HINTS: Partial<Record<ToolId, string>> = {
  field: "Drag on the build plane to place a field",
};

/**
 * A permanently-visible strip in the toolbar's old spot, telling the user what
 * to do next — what a placement tool's drag does, how to back out of it, or
 * (in Select mode) how to get started. Always mounted with the same wrapper
 * markup across every branch so its height never changes, which is the whole
 * point: it now occupies the space the toolbar used to, so the canvas doesn't
 * resize when the hint content changes underneath it. Sits in the layout
 * rather than over the canvas so it can't intercept the very drag it
 * describes. While domino editing mode is active, it instead shows that
 * mode's own Done/Cancel/Help controls — the only way out of the mode, since
 * it's fully modal (see store.ts's dominoEditingId).
 */
export default function ModeHintBar() {
  const activeTool = useStore((s) => s.activeTool);
  // While the properties dialog is open the drag is disarmed, so prompting for
  // one would be a lie.
  const editing = useStore((s) => s.editingDDObjectId !== null);

  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const dominoEditingObject = useStore((s) =>
    s.dominoEditingId ? s.ddObjects[s.dominoEditingId] ?? null : null,
  );
  const exitDominoEditing = useStore((s) => s.exitDominoEditing);
  const openHelpTopic = useStore((s) => s.openHelpTopic);
  // The root BuildPlane always exists and always has a children array — this
  // is "are there any DDObjects yet" for the Select-mode idle hint below.
  const hasElements = useStore((s) => {
    const root = s.ddObjects[s.rootId];
    return "children" in root && root.children.length > 0;
  });

  let content: ReactNode;

  if (!editing && dominoEditingId && dominoEditingObject) {
    // defaultName is the registry's only human-readable type label
    // (getDDObjectDefaultName), doubling as one here.
    const typeLabel = getDDObjectDefaultName(dominoEditingObject.type);
    content = (
      <>
        <span>
          Editing dominoes in "{typeLabel}" "{dominoEditingObject.name}".
        </span>
        <button className={styles.textBtn} onClick={exitDominoEditing}>
          Done
        </button>
        {/* Cancel is identical to Done in this pass — no domino edits exist yet
            to discard. Kept as a separate button so a future pass can diverge
            them (Cancel discarding in-progress edits) without a UI change. */}
        <button className={styles.textBtn} onClick={exitDominoEditing}>
          Cancel
        </button>
        <button className={styles.textBtn} onClick={() => openHelpTopic("domino-editing")}>
          Help
        </button>
      </>
    );
  } else {
    const hint = editing ? undefined : HINTS[activeTool];
    if (hint) {
      content = (
        <>
          <span>{hint}</span>
          <span>·</span>
          <kbd className={styles.key}>Esc</kbd>
          <span>to cancel</span>
        </>
      );
    } else if (!editing && activeTool === "select") {
      content = (
        <span>
          {hasElements
            ? 'Click on an element to select it, click "New" to add more elements, right-click to pan.'
            : 'Click "New" to add an element to your build plane.'}
        </span>
      );
    } else {
      // Fallback for any other state (e.g. the properties dialog open) —
      // nothing meaningful to say, but the same wrapper keeps the row's
      // height constant.
      content = <span>&nbsp;</span>;
    }
  }

  // id is a measurement hook for PropertiesDialog's initial-centering layout
  // effect, which needs this row's actual (intrinsic, content-driven) height
  // now that it's permanently occupying the toolbar's old spot.
  return (
    <div id="mode-hint-bar" className={styles.bar} role="status">
      {content}
    </div>
  );
}
