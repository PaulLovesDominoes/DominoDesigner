import { useStore } from "../store";
import DDObjectsPanel from "./DDObjectsPanel";
import DominoColorPanel from "./DominoColorPanel";
import ImageMapPanel from "../image-map/ImageMapPanel";
import ImageColorScopeBar from "../image-map/ImageColorScopeBar";
import styles from "./Sidebar.module.css";

export default function Sidebar() {
  // Domino editing mode swaps the whole sidebar to the color panel, which
  // stays fully interactive (unlike the rest of the chrome disabled during
  // the mode elsewhere) — it's the mode's primary control surface.
  const editingDominoes = useStore((s) => s.activeTool === "editDominoes");

  return (
    <aside className={styles.sidebar}>
      {editingDominoes ? (
        <>
          {/* Both stack above the swatches and show themselves only while image
              mapping mode is on. The bar's Use Colors setting decides what the
              swatches below it do in that mode: on "all" they go inert, since
              nothing there acts on anything; on "selected" they become tick
              boxes choosing which colours a mapping run may use. */}
          <ImageMapPanel />
          <ImageColorScopeBar />
          <DominoColorPanel />
        </>
      ) : (
        <DDObjectsPanel />
      )}
    </aside>
  );
}
