import DesignerCanvas from "../designer/DesignerCanvas";
import ModeHintBar from "../designer/ModeHintBar";
import Sidebar from "../designer/Sidebar";
import Toolbar from "../designer/Toolbar";
import { useStore } from "../store";
import styles from "./DesignerScreen.module.css";

export default function DesignerScreen() {
  // While properties are being edited, the canvas lifts above the dialog's
  // scrim: the chrome dims but the live preview stays bright and interactive.
  const editing = useStore((s) => s.editingDDObjectId !== null);
  // Placement mode gets a crosshair — but not while the dialog has the drag
  // disarmed, or the cursor would promise an interaction that won't happen.
  const placing = useStore((s) => s.activeTool === "field") && !editing;

  return (
    <div className={styles.screen}>
      <Sidebar />
      <div className={styles.main}>
        <Toolbar />
        <ModeHintBar />
        <div
          className={[
            styles.canvasArea,
            editing ? styles.canvasAreaRaised : "",
            placing ? styles.canvasAreaPlacing : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onContextMenu={(e) => e.preventDefault()}
        >
          <DesignerCanvas />
        </div>
      </div>
    </div>
  );
}
