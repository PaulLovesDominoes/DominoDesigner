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
import DominoModeTools from "./DominoModeTools";
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
  // Clamped to dominoEditingUndoBarrier while in domino editing mode — undo
  // can't reach back into whatever was on the stack before the mode was
  // entered (store.ts's undo() enforces the same clamp; this just keeps the
  // button's enabled state honest about it).
  const canUndo = useStore(
    (s) =>
      s.undoStack.length > 0 &&
      s.undoStack[s.undoStack.length - 1] !== s.dominoEditingUndoBarrier,
  );
  const canRedo = useStore((s) => s.redoStack.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  // Domino editing mode is fully modal: the DDObject tools are swapped out for
  // the mode's own below, and only the canvas and the ModeHintBar's
  // Done/Cancel/Help stay live besides. Zoom is left enabled — it's harmless
  // (and useful) while picking dominoes.
  const editingDominoes = useStore((s) => s.activeTool === "editDominoes");
  // Which DDObject the fit button frames while the mode is on — see its button.
  const dominoEditingId = useStore((s) => s.dominoEditingId);

  // Designer-only. Rendered from TitleBar (mounted on every screen), so it
  // has to gate itself rather than being conditionally mounted by a parent.
  // The Help button next to it (TitleBar.tsx) is not gated — it stays visible
  // on every screen.
  if (screen !== "designer") return null;

  return (
    <div className={styles.bar}>
      {/* Left-justified: Select and the New element-creation menu, swapped out
          wholesale for the mode's own tools while domino editing is on. Those
          two act on the DDObject hierarchy, which the mode is modal against, so
          they'd only ever be shown disabled. */}
      <div className={styles.group}>
        {editingDominoes ? (
          <DominoModeTools />
        ) : (
          <>
            <ToolButton
              label={SELECT_TOOL.label}
              Icon={SELECT_TOOL.Icon}
              active={activeTool === SELECT_TOOL.id}
              onClick={() => setTool(SELECT_TOOL.id)}
            />
            <NewElementMenu />
          </>
        )}
      </div>

      {/* Right-justified: undo/redo, then canvas zoom controls. Nested in one
          outer group so .bar's space-between still splits left (tools) from
          right (everything else) rather than centering this cluster. */}
      <div className={styles.clusterGroup}>
        {/* Undo/redo: real disabled state (unlike the zoom buttons, which
            no-op via optional chaining instead). Not gated on domino editing
            mode — domino color changes are undoable now and expected to be
            undone while still painting. */}
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
          {/* Fits the whole build plane normally, but the field being edited
              while domino editing mode is on: fitting the plane there would
              zoom out of the very thing the mode exists to work on. So in the
              mode this returns the view to exactly what entering it produced,
              undoing any panning and zooming done since. */}
          <button
            className={styles.iconBtn}
            title={dominoEditingId ? "Fit field" : "Reset zoom"}
            aria-label={dominoEditingId ? "Fit field" : "Reset zoom"}
            onClick={() =>
              dominoEditingId
                ? cameraApi?.frameDDObject(dominoEditingId)
                : cameraApi?.resetZoom()
            }
          >
            <RiFullscreenLine size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
