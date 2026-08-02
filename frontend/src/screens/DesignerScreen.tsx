import { useEffect } from "react";

import DesignerCanvas from "../designer/DesignerCanvas";
import ModeHintBar from "../designer/ModeHintBar";
import Sidebar from "../designer/Sidebar";
import { useStore } from "../store";
import { useClipboardStore } from "../clipboard/store";
import styles from "./DesignerScreen.module.css";

export default function DesignerScreen() {
  // While properties are being edited, the canvas lifts above the dialog's
  // scrim: the chrome dims but the live preview stays bright and interactive.
  const editing = useStore((s) => s.editingDDObjectId !== null);
  // Placement mode gets a crosshair — but not while the dialog has the drag
  // disarmed, or the cursor would promise an interaction that won't happen.
  const placing = useStore((s) => s.activeTool === "field") && !editing;

  // Undo/redo and clipboard shortcuts. Scoped to this screen (rather than
  // App.tsx) because both are designer-only — the toolbar's Undo/Redo buttons
  // are designer-only too (Toolbar.tsx's own screen gate) — so mounting/
  // unmounting with the screen gets that scoping for free. Gated on the dialog
  // being closed, matching the !editing convention SelectionTool and
  // CreateByRegionTool already use for their own keydown handlers.
  // Deliberately *not* gated on domino editing mode — domino color changes are
  // undoable now and expected to be undone while still painting; if an
  // undo/redo ever does remove the DDObject currently being domino-edited,
  // applyRemoveDDObject's dominoEditingDeleted check already exits the mode
  // gracefully.
  //
  // Cut/Copy/Paste are handled here, in one place for the whole app, rather
  // than by whichever tool is active: the clipboard store dispatches to
  // whatever handler the current context has registered, so a new clipboard
  // client (DDObject cut/paste next) adds no keyboard code at all. This is
  // also why DominoEditTool's own keydown handler can keep returning early on
  // every Ctrl/Cmd chord — they all belong to this handler.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (s.editingDDObjectId !== null) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useStore.getState().undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        useStore.getState().redo();
      } else if (key === "c") {
        e.preventDefault();
        useClipboardStore.getState().copy();
      } else if (key === "x") {
        e.preventDefault();
        useClipboardStore.getState().cut();
      } else if (key === "v") {
        e.preventDefault();
        useClipboardStore.getState().paste();
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
