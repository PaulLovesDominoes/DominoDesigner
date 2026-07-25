import DDObjectsPanel from "./DDObjectsPanel";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <DDObjectsPanel />
    </aside>
  );
}
