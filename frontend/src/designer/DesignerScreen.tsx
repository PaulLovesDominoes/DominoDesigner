import { useEffect } from "react";

import DesignerCanvas from "./DesignerCanvas";
import ModeHintBar from "./ModeHintBar";
import Sidebar from "./Sidebar";
import { useStore } from "../store";
import { useClipboardStore } from "../clipboard/store";
import { loadImageForElement } from "../image-map/loadImage";
import styles from "./DesignerScreen.module.css";

export default function DesignerScreen() {
  // While properties are being edited, the canvas lifts above the dialog's
  // scrim: the chrome dims but the live preview stays bright and interactive.
  const editing = useStore((s) => s.editingDDObjectId !== null);
  // Placement mode gets a crosshair — but not while the dialog has the drag
  // disarmed, or the cursor would promise an interaction that won't happen.
  // One tool covers every element type (which one is being placed is
  // newElementType, not the tool id), so this is right for a type added later
  // without anyone remembering to come back here.
  const placing = useStore((s) => s.activeTool === "newElement") && !editing;

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
  // also why DominoEditor's own keydown handler can keep returning early on
  // every Ctrl/Cmd chord — they all belong to this handler, Ctrl+A included.
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
      } else if (key === "a") {
        // Select-all means "every domino in the field being edited", so outside
        // domino editing mode this falls through untouched — no preventDefault,
        // leaving the browser's own select-all alone. That gate is also why the
        // missing typing guard in this handler doesn't bite here: the mode's
        // sidebar is the swatch panel, with no text inputs in it.
        if (!s.dominoEditingId) return;
        e.preventDefault();
        // Inside image mapping it means the swatch palette instead. Nothing
        // there acts on the domino selection — setImageMapActive clears it on
        // the way in — so selecting every domino would only light the field up
        // with boxes no tool could use. With Use Colors on "all" there is
        // nothing to tick either, so this does nothing at all.
        if (s.imageMapActive) {
          if (s.imageMapColorScope === "selected") s.setAllImageMapColors(true);
          return;
        }
        useStore.getState().selectAllDominoes();
      } else if (key === "i" && !e.shiftKey) {
        // Show or hide the overlay picture, or ask for one if the element has
        // none — the keyboard equivalent of the toolbar's image button.
        //
        // Gated on the mode first and only then preventDefault'd, exactly as
        // Ctrl+A above is, so outside domino editing the browser keeps whatever
        // Ctrl+I means to it. !e.shiftKey matters: `key` was lowercased above,
        // so without it this would also swallow Ctrl+Shift+I, which opens the
        // browser's developer tools.
        if (!s.dominoEditingId) return;
        // Unlike the branches above, this one can fire while the pointer is in
        // the image mapping sidebar, which does hold form controls — hence the
        // typing guard the rest of this handler does without.
        const el = e.target as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
          return;
        }
        e.preventDefault();
        if (s.imageMaps[s.dominoEditingId]) s.toggleImageVisible(s.dominoEditingId);
        else void loadImageForElement(s.dominoEditingId);
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
