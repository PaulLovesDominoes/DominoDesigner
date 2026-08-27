import {
  RiArrowGoBackLine,
  RiArrowGoForwardLine,
  RiFullscreenLine,
  RiZoomInLine,
  RiZoomOutLine,
  type RemixiconComponentType,
} from "@remixicon/react";

import { HideUpperLayersIcon, ShowAllLayersIcon } from "../icons";
import {
  DOMINO_ORIENTATION_COMMANDS,
  dominoOrientationTooltip,
} from "./dominoOrientationCommands";
import {
  getOperationIcon,
  getOperationToolbarLabel,
  type StructureOperationType,
} from "./operation-types/registry";
import { useStructureStore } from "./store";
import {
  STRUCTURE_TOOL_COMMANDS,
  structureToolTooltip,
} from "./structureToolCommands";
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
 * Everything about it still comes from the registry — the icon and the wording —
 * so the buttons above differ only in where they sit and what type they name. In
 * particular the icon comes from the type, so an operation cannot appear under
 * one glyph here and a different one in the sidebar.
 *
 * A plain button rather than the Designer's ToolButton, for two reasons: this is
 * a command rather than a mode, and ToolButton always reports a pressed or
 * unpressed state to screen readers, which a command has no business claiming;
 * and it comes with the Designer's stylesheet, which this screen deliberately
 * does not share.
 *
 * There is no greyed state. A grid definition used to refuse a second while every
 * layer shared one grid; grid definitions now stack across the layers the way
 * layer definitions do, so any number of either may be made.
 */
function OperationCommand({
  type,
  onCreate,
}: {
  type: StructureOperationType;
  onCreate: (type: StructureOperationType) => void;
}) {
  const Icon = getOperationIcon(type);
  const label = getOperationToolbarLabel(type);

  return (
    <button
      className={styles.iconBtn}
      title={label}
      aria-label={label}
      onClick={() => onCreate(type)}
    >
      <Icon size={20} />
    </button>
  );
}

/**
 * One button of a set where exactly one is always chosen — which tool the canvas
 * is in, and which way up the next domino goes.
 *
 * A mode rather than a command, so unlike OperationCommand above it reports
 * whether it is on: to the eye through .active, and to a screen reader through
 * aria-pressed, the same treatment Show All Layers gets. Choosing one is what
 * un-chooses the rest of its set, because the store holds a single value per set
 * rather than a flag per button.
 *
 * Deliberately not role="radiogroup". The pressed-button idiom and its CSS
 * already exist on this toolbar, and a radio group would bring its own keyboard
 * conventions to a set of buttons that already have single-key shortcuts.
 *
 * Shared by the two sets rather than written twice: they differ only in what
 * their table holds, and a second near-identical component would be the thing
 * that eventually looked different for no reason.
 */
function ModeCommand({
  icon: Icon,
  tooltip,
  active,
  onChoose,
}: {
  icon: RemixiconComponentType;
  tooltip: string;
  active: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      className={active ? `${styles.iconBtn} ${styles.active}` : styles.iconBtn}
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={active}
      onClick={onChoose}
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
  const showAllLayers = useStructureStore((s) => s.showAllLayers);
  const toggleShowAllLayers = useStructureStore((s) => s.toggleShowAllLayers);
  const tool = useStructureStore((s) => s.tool);
  const setTool = useStructureStore((s) => s.setTool);
  const dominoOrientation = useStructureStore((s) => s.dominoOrientation);
  const setDominoOrientation = useStructureStore((s) => s.setDominoOrientation);
  const hideDominoesAbove = useStructureStore((s) => s.hideDominoesAbove);
  const toggleHideDominoesAbove = useStructureStore(
    (s) => s.toggleHideDominoesAbove,
  );

  return (
    <div className={styles.bar}>
      {/* Left-justified. Three clusters, wrapped so .bar's space-between splits
          left from right rather than spreading them apart: the operations that
          describe the structure, then what a drag on the canvas does, then how a
          domino goes down when that drag is placing one. */}
      <div className={styles.clusterGroup}>
        {/*
          **Written out one button at a time rather than looped over the
          registry**. The order mixes operation commands with a view toggle —
          Show All Layers belongs beside the layer definition it shows the result
          of, not after every operation type — and a loop can only ever put the
          toggle before or after the whole run of them. The cost is that adding
          an operation type means adding its button here; that is one line, and
          it buys the ability to say where the button goes. (A type created by a
          gesture rather than a command has no button at all — see
          operation-types/dominoGroup/object-model.ts.)
        */}
        <div className={styles.group}>
          <OperationCommand
            type="layerDefinition"
            onCreate={createOperation}
          />

          {/*
            A toggle rather than a command, so unlike the buttons either side of
            it it reports whether it is on — both to the eye, through .active,
            and to a screen reader, through aria-pressed. It sits here because
            what it shows is every layer the definitions to its left describe.
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
            onCreate={createOperation}
          />
        </div>

        <span className={styles.separator} aria-hidden="true" />

        {/*
          What a left-drag on the canvas does. A cluster of its own, and ahead of
          the orientations, because it decides whether those mean anything at all
          on the next drag.

          Looped, unlike the operation commands above, because nothing else goes
          among them: they are one set of alternatives, and the table they come
          from is the order they should appear in.
        */}
        <div className={styles.group}>
          {STRUCTURE_TOOL_COMMANDS.map((command) => (
            <ModeCommand
              key={command.tool}
              icon={command.icon}
              tooltip={structureToolTooltip(command)}
              active={command.tool === tool}
              onChoose={() => setTool(command.tool)}
            />
          ))}
        </div>

        <span className={styles.separator} aria-hidden="true" />

        {/*
          The three ways up a domino can be placed, and the one view toggle that
          is about dominoes rather than about layers. Separate from the tools to
          their left because this is a setting the placement tool reads rather
          than an alternative to it — both can be chosen at once, and are.
        */}
        <div className={styles.group}>
          {DOMINO_ORIENTATION_COMMANDS.map((command) => (
            <ModeCommand
              key={command.orientation}
              icon={command.icon}
              tooltip={dominoOrientationTooltip(command)}
              active={command.orientation === dominoOrientation}
              onChoose={() => setDominoOrientation(command.orientation)}
            />
          ))}

          {/*
            Hides the dominoes standing above the layer being worked on, so a
            course with more built on top of it can still be looked at straight
            down. Deliberately separate from Show All Layers, which is about how
            many sheets to draw — see the store.
          */}
          <button
            className={
              hideDominoesAbove
                ? `${styles.iconBtn} ${styles.active}`
                : styles.iconBtn
            }
            title="Hide dominoes above this layer"
            aria-label="Hide dominoes above this layer"
            aria-pressed={hideDominoesAbove}
            onClick={toggleHideDominoesAbove}
          >
            <HideUpperLayersIcon size={20} />
          </button>
        </div>
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