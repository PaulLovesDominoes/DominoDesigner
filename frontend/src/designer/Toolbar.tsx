import {
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

      {/* Right-justified: canvas zoom controls. */}
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
  );
}
