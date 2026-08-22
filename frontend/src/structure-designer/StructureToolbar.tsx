import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFullscreenLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";

import { useStructureStore } from "./store";
import styles from "./StructureToolbar.module.css";

// Zoom step for the +/- buttons (±5%).
const ZOOM_IN = 1.05;
const ZOOM_OUT = 0.95;

/**
 * The Structure Designer's toolbar, rendered by TitleBar in place of the
 * Designer's whenever this screen is showing. Its own component and its own
 * stylesheet, so the two toolbars can fill up with different tools without
 * either one having to be checked against the other.
 *
 * The left-hand group, where those tools will go, is empty for now.
 *
 * Undo and Redo read this screen's own history, which is deliberately separate
 * from the Designer's (see store.ts). Nothing here edits anything yet, so both
 * stay disabled — which is the honest state rather than a placeholder.
 */
export default function StructureToolbar() {
  const cameraApi = useStructureStore((s) => s.cameraApi);
  const canUndo = useStructureStore((s) => s.undoStack.length > 0);
  const canRedo = useStructureStore((s) => s.redoStack.length > 0);
  const undo = useStructureStore((s) => s.undo);
  const redo = useStructureStore((s) => s.redo);

  return (
    <div className={styles.bar}>
      {/* Left-justified: the structure design tools, once there are any. */}
      <div className={styles.group} />

      {/* Right-justified: undo/redo, then the camera controls. Nested in one
          outer group so .bar's space-between splits left from right rather
          than centring this cluster. */}
      <div className={styles.clusterGroup}>
        <div className={styles.group}>
          <button
            className={styles.iconBtn}
            title="Undo"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <RiArrowGoBackLine size={20} />
          </button>
          <button
            className={styles.iconBtn}
            title="Redo"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <RiArrowGoForwardLine size={20} />
          </button>
        </div>

        <div className={styles.group}>
          <button
            className={styles.iconBtn}
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => cameraApi?.zoomBy(ZOOM_IN)}
          >
            <RiZoomInLine size={20} />
          </button>
          <button
            className={styles.iconBtn}
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => cameraApi?.zoomBy(ZOOM_OUT)}
          >
            <RiZoomOutLine size={20} />
          </button>
          {/* Fits the build plane and straightens the view back to
              straight-down in one press — the only way back from a rotation. */}
          <button
            className={styles.iconBtn}
            title="Fit and straighten view"
            aria-label="Fit and straighten view"
            onClick={() => cameraApi?.resetView()}
          >
            <RiFullscreenLine size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}