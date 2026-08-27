import { useEffect } from "react";

import { useStore } from "../store";
import { dominoOrientationForKey } from "./dominoOrientationCommands";
import LayerSlider, { LAYER_SLIDER_TRACK_ID } from "./LayerSlider";
import StructureCanvas from "./StructureCanvas";
import StructureHintBar from "./StructureHintBar";
import StructureOperationDialog from "./StructureOperationDialog";
import StructureSidebar from "./StructureSidebar";
import { useStructureStore } from "./store";
import { structureToolForKey } from "./structureToolCommands";
import styles from "./StructureDesignerScreen.module.css";

/** How many layers Page Up and Page Down move, on their own and with Shift. */
const LAYER_PAGE_STEP = 1;
const LAYER_PAGE_SHIFT_STEP = 5;

/**
 * Where three-dimensional domino structures are designed, layer by layer. What
 * it produces will eventually be a description of how to build a structure,
 * which the Designer screen reads to create an element from — that description
 * is the whole of what the two screens have to say to each other.
 *
 * The shell: the canvas, its build plane, the layer chooser and the standard
 * controls, plus the keyboard shortcuts that are nobody tool's in particular —
 * undo and redo, the layer keys, Delete, and the single letters that choose a
 * tool or an orientation. A gesture's own keys are handled by the tool running
 * it, which is why Escape and the arrow keys are not here.
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
      // Same reasoning for this screen's own dialog, read imperatively for the
      // same reason. It is what stops Ctrl+Z inside the dialog undoing the very
      // operation being edited — which means undo and redo never have to reason
      // about a dialog being open.
      if (useStructureStore.getState().modifyingOperationId !== null) return;

      // Nothing here should fire while the user is typing. Both dialogs are
      // already excluded above and they hold the only text boxes on this screen
      // today, so this changes nothing yet — but the orientation keys below are
      // bare letters rather than chords, and the day a box appears in the
      // sidebar or the hint bar, typing "surface" would otherwise cycle through
      // three orientations on the way past.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }

      // The keys that need no modifier. Guarded positively against every one of
      // them rather than merely sitting above the Ctrl test below: Ctrl+U, Ctrl+S
      // and Ctrl+R are the browser's own View Source, Save Page and Reload, and
      // this must not answer to those as well. Shift is not excluded, because it
      // is what makes Page Up move five layers instead of one.
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const structure = useStructureStore.getState();

        /*
         * Page Up and Page Down move the layer being worked on.
         *
         * Only while the pointer is over the canvas or the layer control has
         * focus, so they cannot fire at whatever the user is doing elsewhere on
         * the page. Both routes come through here rather than the control keeping
         * a copy of the arithmetic, which is what stops the two coming to mean
         * different amounts.
         */
        const layerDirection =
          e.key === "PageUp" ? 1 : e.key === "PageDown" ? -1 : 0;
        if (layerDirection !== 0) {
          const overLayerControl =
            document.activeElement?.id === LAYER_SLIDER_TRACK_ID;
          if (structure.pointerOverCanvas || overLayerControl) {
            e.preventDefault();
            const step = e.shiftKey ? LAYER_PAGE_SHIFT_STEP : LAYER_PAGE_STEP;
            structure.setLayer(structure.layer + layerDirection * step);
          }
          return;
        }

        // Deleting the selected dominoes. Not gated on the pointer being over the
        // canvas: what it acts on is a selection the user can see, wherever they
        // happen to be pointing. Backspace as well as Delete, since laptop
        // keyboards often make the first hard to reach.
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          structure.deleteSelectedDominoes();
          return;
        }

        // One key each for the three ways up a domino can be placed, and one for
        // the rectangular select tool. Escape, the other tool's shortcut, is
        // deliberately not here — see structureToolForKey.
        const orientation = dominoOrientationForKey(e.key);
        if (orientation) {
          e.preventDefault();
          structure.setDominoOrientation(orientation);
          return;
        }

        const tool = structureToolForKey(e.key);
        if (tool) {
          e.preventDefault();
          structure.setTool(tool);
        }
        return;
      }

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

  // The operation dialog is modeless: its scrim dims the chrome while the canvas
  // lifts above it, so what the operation is describing stays visible and the
  // view stays rotatable while its properties are typed.
  const modifying = useStructureStore((s) => s.modifyingOperationId !== null);
  const setPointerOverCanvas = useStructureStore((s) => s.setPointerOverCanvas);

  return (
    <div className={styles.screen}>
      <StructureSidebar />
      <div className={styles.main}>
        <StructureHintBar />
        <div
          className={
            modifying
              ? `${styles.canvasArea} ${styles.canvasAreaRaised}`
              : styles.canvasArea
          }
          // Right-dragging is how the view is panned, so the browser's own
          // right-click menu has to be kept out of the way or it opens on
          // every pan.
          onContextMenu={(e) => e.preventDefault()}
          // Which keys act on the structure rather than on whatever else has the
          // user's attention — see the keydown handler above. Enter and leave
          // rather than move, so this fires twice a visit rather than on every
          // frame of a drag.
          onPointerEnter={() => setPointerOverCanvas(true)}
          onPointerLeave={() => setPointerOverCanvas(false)}
        >
          <StructureCanvas />
        </div>
      </div>
      <LayerSlider />
      <StructureOperationDialog />
    </div>
  );
}