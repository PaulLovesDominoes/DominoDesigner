import { useEffect } from "react";

import { useStore } from "../store";
import LayerSlider from "./LayerSlider";
import StructureCanvas from "./StructureCanvas";
import StructureHintBar from "./StructureHintBar";
import StructureSidebar from "./StructureSidebar";
import { useStructureStore } from "./store";
import styles from "./StructureDesignerScreen.module.css";

/**
 * Where three-dimensional domino structures are designed, layer by layer. What
 * it produces will eventually be a description of how to build a structure,
 * which the Designer screen reads to create an element from — that description
 * is the whole of what the two screens have to say to each other.
 *
 * This is the shell: the canvas, its build plane, the layer chooser and the
 * standard controls. The tools go in next.
 */
export default function StructureDesignerScreen() {
  // Undo and redo act on this screen's own history, kept apart from the
  // Designer's so a press here can never change the domino build on the other
  // screen, which the user would have no way of seeing happen.
  //
  // The handler lives here rather than in App, so it is installed and removed
  // with the screen — which is the whole of what scopes it to this screen.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // The properties dialog belongs to the Designer but is mounted over
      // every screen, so it could in principle still be open after a switch.
      // Read straight from the store rather than subscribing: this only needs
      // the answer at the moment a key is pressed, and subscribing would make
      // the whole screen re-render whenever the dialog opened or closed.
      if (useStore.getState().editingDDObjectId !== null) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        useStructureStore.getState().undo();
      } else if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        useStructureStore.getState().redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className={styles.screen}>
      <StructureSidebar />
      <div className={styles.main}>
        <StructureHintBar />
        <div
          className={styles.canvasArea}
          // Right-dragging is how the view is panned, so the browser's own
          // right-click menu has to be kept out of the way or it opens on
          // every pan.
          onContextMenu={(e) => e.preventDefault()}
        >
          <StructureCanvas />
        </div>
      </div>
      <LayerSlider />
    </div>
  );
}