import styles from "./SettingsScreen.module.css";

/**
 * Application settings. The build plane's size and color now live on the
 * BuildPlane object itself — edit them from the object hierarchy's Properties
 * menu — which leaves nothing here yet.
 */
export default function SettingsScreen() {
  return (
    <div className={styles.screen}>
      <p className={styles.empty}>No settings yet.</p>
    </div>
  );
}
