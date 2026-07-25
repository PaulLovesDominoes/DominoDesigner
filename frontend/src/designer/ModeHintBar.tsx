import { useStore } from "../store";
import type { ToolId } from "../types";
import styles from "./ModeHintBar.module.css";

/**
 * What each placement tool asks the user to do. A tool with no entry here is an
 * ordinary tool and shows no hint, so adding a tool never means editing this
 * component's markup — only this map.
 */
const HINTS: Partial<Record<ToolId, string>> = {
  field: "Drag on the build plane to place a field",
};

/**
 * A thin strip below the toolbar while a placement tool is active, telling the
 * user what the drag does and how to back out. Sits in the layout rather than
 * over the canvas so it can't intercept the very drag it describes.
 */
export default function ModeHintBar() {
  const activeTool = useStore((s) => s.activeTool);
  // While the properties dialog is open the drag is disarmed, so prompting for
  // one would be a lie.
  const editing = useStore((s) => s.editingDDObjectId !== null);

  const hint = editing ? undefined : HINTS[activeTool];
  if (!hint) return null;

  return (
    <div className={styles.bar} role="status">
      <span>{hint}</span>
      <span>·</span>
      <kbd className={styles.key}>Esc</kbd>
      <span>to cancel</span>
    </div>
  );
}
