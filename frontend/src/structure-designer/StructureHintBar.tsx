import styles from "./StructureHintBar.module.css";

/**
 * Says how to move the view. Rotating is otherwise impossible to discover —
 * there is no button for it — and the Designer already tells the user in the
 * same place that right-dragging pans, so this is where it belongs.
 */
export default function StructureHintBar() {
  return (
    <div className={styles.bar} role="status">
      <span>Right-drag to pan.</span>
      <span className={styles.key}>Shift</span>
      <span>+ right-drag to rotate the view. Scroll to zoom.</span>
    </div>
  );
}