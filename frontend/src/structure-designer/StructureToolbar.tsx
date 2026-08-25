import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFullscreenLine,
  RiZoomInLine,
  RiZoomOutLine,
} from "@remixicon/react";

import { ShowAllLayersIcon } from "../icons";
import type { StructureOperationBase } from "./operation-types/base";
import {
  getOperationCreateDisabledReason,
  getOperationIcon,
  getOperationToolbarLabel,
  type StructureOperationType,
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
 * The left-hand group holds one command per operation type, plus the Show All
 * Layers toggle sitting among them. Each command still takes its icon, wording
 * and availability from the registry; only the order is written out here.
 *
 * Undo and Redo read this screen's own history, which is deliberately separate
 * from the Designer's (see store.ts).
 */
/**
 * The button that creates one operation of a given type.
 *
 * Everything about it still comes from the registry — the icon, the wording, and
 * whether another one may be made — so the buttons above differ only in where
 * they sit and what type they name. In particular the icon comes from the type,
 * so an operation cannot appear under one glyph here and a different one in the
 * sidebar.
 *
 * A plain button rather than the Designer's ToolButton, for two reasons: this is
 * a command rather than a mode, and ToolButton always reports a pressed or
 * unpressed state to screen readers, which a command has no business claiming;
 * and it comes with the Designer's stylesheet, which this screen deliberately
 * does not share.
 */
function OperationCommand({
  type,
  operations,
  onCreate,
}: {
  type: StructureOperationType;
  operations: readonly StructureOperationBase[];
  onCreate: (type: StructureOperationType) => void;
}) {
  const Icon = getOperationIcon(type);
  const label = getOperationToolbarLabel(type);
  // A type may refuse a new instance — a grid definition does once one exists,
  // since every layer shares the one grid. The reason doubles as the tooltip, so
  // a greyed button always says why it is greyed.
  const disabledReason = getOperationCreateDisabledReason(type, operations);

  return (
    <button
      className={styles.iconBtn}
      title={disabledReason ?? label}
      aria-label={label}
      disabled={disabledReason !== undefined}
      onClick={() => onCreate(type)}
    >
      <Icon size={20} />
    </button>
  );
}

export default function StructureToolbar() {
  const cameraApi = useStructureStore((s) => s.cameraApi);
  const canUndo = useStructureStore((s) => s.undoStack.length > 0);
  const canRedo = useStructureStore((s) => s.redoStack.length > 0);
  const undo = useStructureStore((s) => s.undo);
  const redo = useStructureStore((s) => s.redo);
  const createOperation = useStructureStore((s) => s.createOperation);
  // Needed only so a command can grey itself once its type says no more of these
  // can be made — see getOperationCreateDisabledReason.
  const operations = useStructureStore((s) => s.operations);
  const showAllLayers = useStructureStore((s) => s.showAllLayers);
  const toggleShowAllLayers = useStructureStore((s) => s.toggleShowAllLayers);

  return (
    <div className={styles.bar}>
      {/*
        Left-justified, and **written out one button at a time rather than looped
        over the registry**. The order mixes operation commands with a view
        toggle — Show All Layers belongs beside the layer definition it shows the
        result of, not after every operation type — and a loop can only ever put
        the toggle before or after the whole run of them. The cost is that adding
        an operation type now means adding its button here; that is one line, and
        it buys the ability to say where the button goes.
      */}
      <div className={styles.group}>
        <OperationCommand
          type="layerDefinition"
          operations={operations}
          onCreate={createOperation}
        />

        {/*
          A toggle rather than a command, so unlike the buttons either side of it
          it reports whether it is on — both to the eye, through .active, and to
          a screen reader, through aria-pressed. It sits here because what it
          shows is every layer the definitions to its left describe.
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

        <OperationCommand
          type="gridDefinition"
          operations={operations}
          onCreate={createOperation}
        />
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