import styles from "./StructureSidebar.module.css";

/**
 * The Structure Designer's sidebar: its title, and below it the list of
 * instructions describing how the structure is built. The list is empty until
 * there is something to put in it.
 */
export default function StructureSidebar() {
  return (
    <aside className={styles.sidebar}>
      <h2 className={styles.title}>Structure Designer</h2>
      <div className={styles.instructions} />
    </aside>
  );
}