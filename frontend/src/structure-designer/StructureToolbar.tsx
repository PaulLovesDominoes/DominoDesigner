import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFullscreenLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";

import { ShowAllLayersIcon } from "../icons";
import {
  getOperationIcon,
  getOperationToolbarLabel,
  STRUCTURE_OPERATION_LIST,
} from "./operation-types/registry";
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
 * The left-hand group holds one command per registered operation type, built
 * from the registry so adding an operation type puts its button here without
 * this file being touched.
 *
 * Undo and Redo read this screen's own history, which is deliberately separate
 * from the Designer's (see store.ts).
 */
export default function StructureToolbar() {
  const cameraApi = useStructureStore((s) => s.cameraApi);
  const canUndo = useStructureStore((s) => s.undoStack.length > 0);
  const canRedo = useStructureStore((s) => s.redoStack.length > 0);
  const undo = useStructureStore((s) => s.undo);
  const redo = useStructureStore((s) => s.redo);
  const createOperation = useStructureStore((s) => s.createOperation);
  const showAllLayers = useStructureStore((s) => s.showAllLayers);
  const toggleShowAllLayers = useStructureStore((s) => s.toggleShowAllLayers);

  return (
    <div className={styles.bar}>
      {/*
        Left-justified: one button per operation type. Plain buttons rather than
        the Designer's ToolButton, for two reasons — these are commands rather
        than modes, and ToolButton always reports a pressed/unpressed state to
        screen readers, which a command has no business claiming; and it comes
        with the Designer's stylesheet, which this screen deliberately does not
        share. The icon comes from the type, so an operation cannot appear under
        one glyph here and a different one in the sidebar.
      */}
      <div className={styles.group}>
        {STRUCTURE_OPERATION_LIST.map((type) => {
          const Icon = getOperationIcon(type);
          const label = getOperationToolbarLabel(type);
          return (
            <button
              key={type}
              className={styles.iconBtn}
              title={label}
              aria-label={label}
              onClick={() => createOperation(type)}
            >
              <Icon size={20} />
            </button>
          );
        })}

        {/*
          A toggle rather than a command, so unlike the buttons above it reports
          whether it is on — both to the eye, through .active, and to a screen
          reader, through aria-pressed.
        */}
        <button
          className={
            showAllLayers ? `${styles.iconBtn} ${styles.active}` : styles.iconBtn
          }
          title="Show all layers"
          aria-label="Show all layers"
          aria-pressed={showAllLayers}
          onClick={toggleShowAllLayers}
        >
          <ShowAllLayersIcon size={20} />
        </button>
      </div>

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