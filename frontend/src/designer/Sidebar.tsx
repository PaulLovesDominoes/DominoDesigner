import { useStore } from "../store";
import DDObjectsPanel from "./DDObjectsPanel";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  // Domino editing mode is fully modal — the sidebar (selection, ⋯ menu) is
  // locked out for its whole duration; only Done/Cancel in the ModeHintBar
  // leaves the mode.
  const editingDominoes = useStore((s) => s.activeTool === "editDominoes");

  return (
    <aside className={editingDominoes ? `${styles.sidebar} ${styles.disabled}` : styles.sidebar}>
      <DDObjectsPanel />
    </aside>
  );
}
