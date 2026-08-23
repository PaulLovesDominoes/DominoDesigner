import StructureOperationList from "./StructureOperationList";
import styles from "./StructureSidebar.module.css";

/**
 * The Structure Designer's sidebar: its title, and below it the operations that
 * describe how the structure is built, in build order.
 */
export default function StructureSidebar() {
  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.title}>Structure Designer</h2>
      <div className={styles.operations}>
        <StructureOperationList />
      </div>
    </aside>
  );
}