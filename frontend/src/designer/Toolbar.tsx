import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFullscreenLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";

import { useStore } from "../store";
import ToolButton from "./ToolButton";
import NewElementMenu from "./NewElementMenu";
import { TOOLS } from "./toolConfig";
import styles from "./Toolbar.module.css";

// The sole non-creation tool. Element-creation tools (TOOLS entries with an
// elementType) live in NewElementMenu's popup instead of their own buttons.
const SELECT_TOOL = TOOLS.find((t) => !t.elementType)!;

// Zoom step for the +/- buttons (±5%).
const ZOOM_IN = 1.05;
const ZOOM_OUT = 0.95;

export default function Toolbar() {
  const screen = useStore((s) => s.screen);
  const activeTool = useStore((s) => s.activeTool);
  const setTool = useStore((s) => s.setTool);
  const cameraApi = useStore((s) => s.cameraApi);
  const canUndo = useStore((s) => s.undoStack.length > 0);
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  // Domino editing mode is fully modal: only the canvas and the ModeHintBar's
  // Done/Cancel/Help stay live. Zoom is left enabled — it's harmless (and
  // useful) while picking dominoes.
  const editingDominoes = useStore((s) => s.activeTool === "editDominoes");

  // Designer-only. Rendered from TitleBar (mounted on every screen), so it
  // has to gate itself rather than being conditionally mounted by a parent.
  // The Help button next to it (TitleBar.tsx) is not gated — it stays visible
  // on every screen.
  if (screen !== "designer") return null;

  return (
    <div className={styles.bar}>
      {/* Left-justified: Select, then the New element-creation menu. */}
      <div className={styles.group}>
        <ToolButton
          label={SELECT_TOOL.label}
          Icon={SELECT_TOOL.Icon}
          active={activeTool === SELECT_TOOL.id}
          onClick={() => setTool(SELECT_TOOL.id)}
          disabled={editingDominoes}
        />
        <NewElementMenu />
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
            disabled={editingDominoes || !canUndo}
            onClick={undo}
          >
            <RiArrowGoBackLine size={20} />
          </button>
          <button
            className={styles.iconBtn}
            title="Redo"
            aria-label="Redo"
            disabled={editingDominoes || !canRedo}
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
