import { useStore } from "../store";
import DDObjectsPanel from "./DDObjectsPanel";
import DominoColorPanel from "./DominoColorPanel";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  // Domino editing mode swaps the whole sidebar to the color panel, which
  // stays fully interactive (unlike the rest of the chrome disabled during
  // the mode elsewhere) — it's the mode's primary control surface.
  const editingDominoes = useStore((s) => s.activeTool === "editDominoes");

  return (
    <aside className={styles.sidebar}>
      {editingDominoes ? <DominoColorPanel /> : <DDObjectsPanel />}
    </aside>
  );
}
