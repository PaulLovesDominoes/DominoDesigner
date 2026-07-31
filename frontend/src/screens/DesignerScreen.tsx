import { useEffect } from "react";

import DesignerCanvas from "../designer/DesignerCanvas";
import ModeHintBar from "../designer/ModeHintBar";
import Sidebar from "../designer/Sidebar";
import { useStore } from "../store";
import styles from "./DesignerScreen.module.css";

export default function DesignerScreen() {
  // While properties are being edited, the canvas lifts above the dialog's
  // scrim: the chrome dims but the live preview stays bright and interactive.
  const editing = useStore((s) => s.editingDDObjectId !== null);
  // Placement mode gets a crosshair — but not while the dialog has the drag
  // disarmed, or the cursor would promise an interaction that won't happen.
  const placing = useStore((s) => s.activeTool === "field") && !editing;

  // Undo/redo shortcuts. Scoped to this screen (rather than App.tsx) because
  // undo/redo is designer-only — the toolbar's Undo/Redo buttons are designer-
  // only too (Toolbar.tsx's own screen gate) — so mounting/unmounting with the
  // screen gets that scoping for free. Gated on the dialog being closed,
  // matching the !editing convention SelectionTool and CreateByRegionTool
  // already use for their own keydown handlers.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      // Domino editing mode is fully modal — undo/redo is disabled the same way
      // the toolbar's buttons are (see Toolbar.tsx), so a stray Ctrl+Z can't
      // remove the very DDObject whose dominoes are being edited.
      if (s.editingDDObjectId !== null || s.activeTool === "editDominoes") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        useStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.screen}>
      <Sidebar />
      <div className={styles.main}>
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
