import { useStore } from "../store";
import type { ImageMapColorScope } from "./palette";
import styles from "./ImageColorScopeBar.module.css";

/**
 * Use Colors: All / Selected, with Select All / None beside it.
 *
 * It sits between ImageMapPanel and DominoColorPanel in the sidebar, which puts
 * it just below the rule at the bottom of the mapping controls (that rule is
 * ImageMapPanel's own border-bottom) and directly above the swatch grid it
 * governs. It lives here rather than inside DominoColorPanel because it is an
 * image-mapping control: the swatch panel knows nothing about mapping beyond how
 * to draw itself while it is on.
 *
 * On "selected" the swatches become tick boxes — see DominoColorPanel.
 */
export default function ImageColorScopeBar() {
  const imageMapActive = useStore((s) => s.imageMapActive);
  const imageMapColorScope = useStore((s) => s.imageMapColorScope);
  const setImageMapColorScope = useStore((s) => s.setImageMapColorScope);
  const setAllImageMapColors = useStore((s) => s.setAllImageMapColors);

  if (!imageMapActive) return null;

  // Nothing to tick or untick while every colour is in play.
  const picking = imageMapColorScope === "selected";

  return (
    <div className={styles.bar}>
      <label className={styles.label} htmlFor="image-map-color-scope">
        Use Colors:
      </label>
      <select
        id="image-map-color-scope"
        className={styles.select}
        value={imageMapColorScope}
        onChange={(e) => setImageMapColorScope(e.target.value as ImageMapColorScope)}
      >
        <option value="all">All</option>
        <option value="selected">Selected</option>
      </select>

      <span className={styles.label}>Select:</span>
      <button
        className={styles.button}
        disabled={!picking}
        onClick={() => setAllImageMapColors(true)}
      >
        All
      </button>
      <button
        className={styles.button}
        disabled={!picking}
        onClick={() => setAllImageMapColors(false)}
      >
        None
      </button>
    </div>
  );
}