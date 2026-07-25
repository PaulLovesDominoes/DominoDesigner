import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFullscreenLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";

import { useStore } from "../store";
import ToolButton from "./ToolButton";
import { TOOLS } from "./toolConfig";
import styles from "./Toolbar.module.css";

// Zoom step for the +/- buttons (±5%).
const ZOOM_IN = 1.05;
const ZOOM_OUT = 0.95;

export default function Toolbar() {
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const cameraApi = useStore((s) => s.cameraApi);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);

  return (
    <div className={styles.bar}>
      {/* Left-justified: tools (single-select). */}
      <div className={styles.group}>
        {TOOLS.map((tool) => (
          <ToolButton
            key={tool.id}
            label={tool.label}
            Icon={tool.Icon}
            active={activeTool === tool.id}
            onClick={() => setTool(tool.id)}
          />
        ))}
      </div>

      {/* Right-justified: undo/redo, then canvas zoom controls. Nested in one
          outer group so .bar's space-between still splits left (tools) from
          right (everything else) rather than centering this cluster. */}
      <div className={styles.clusterGroup}>
        {/* Undo/redo: real disabled state (unlike the zoom buttons, which
            no-op via optional chaining instead). */}
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
          <button
            className={styles.iconBtn}
            title="Reset zoom"
            aria-label="Reset zoom"
            onClick={() => cameraApi?.resetZoom()}
          >
            <RiFullscreenLine size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
