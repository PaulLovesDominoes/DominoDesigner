import {
  RiCheckboxMultipleLine,
  RiCollapseDiagonalLine,
  RiContrastFill,
  RiExpandDiagonalLine,
  RiRectangleLine,
} from "@remixicon/react";

import { useStore } from "../store";
import { getDominoExpansion } from "../object-types/registry";
import { SHAPE_SELECT_LIST, type ShapeSelectId } from "../shape-select/registry";
import ToolButton from "./ToolButton";
import styles from "./Toolbar.module.css";

/**
 * The toolbar's domino-editing-mode group, replacing Select and New for the
 * duration of the mode (see Toolbar.tsx) — those two act on the DDObject
 * hierarchy, which the mode is modal against. Kept as its own component, like
 * NewElementMenu, so Toolbar stays a layout file rather than growing a branch
 * per mode-specific button.
 */
export default function DominoEditingTools() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));
  const dominoExpanded = useStore((s) => s.dominoExpanded);
  const toggleDominoExpanded = useStore((s) => s.toggleDominoExpanded);
  const selectAllDominoes = useStore((s) => s.selectAllDominoes);
  const invertDominoSelection = useStore((s) => s.invertDominoSelection);
  const dominoShapeSelectId = useStore((s) => s.dominoShapeSelectId);
  const setDominoShapeSelect = useStore((s) => s.setDominoShapeSelect);

  if (!dominoEditingId) return null;

  // The element type both decides how much its dominoes grow and, by declining
  // to answer, says they can't grow at all — a field with no spacing has nowhere
  // to expand into.
  const canExpand = !!ddObject && !!getDominoExpansion(ddObject);

  return (
    <>
      {/* Commands and the Expand toggle come first, then a separator, then the
          selection modes. The modes are the group that grows as shapes are
          registered, so putting them last keeps everything else at a fixed
          position in the toolbar rather than sliding along each time a shape is
          added.

          Raw buttons, not ToolButton, for the two commands: they are commands
          rather than toggles, so the aria-pressed ToolButton always emits would
          be wrong — the same reason Toolbar's undo/redo/zoom are raw. Neither
          needs a disabled state: the store actions no-op safely, inverting an
          empty selection is meaningfully "select everything", and a field can't
          have zero dominoes (createFromRegion rejects anything under one
          row/column). */}
      <button
        className={styles.iconBtn}
        title="Select all dominoes (Ctrl+A)"
        aria-label="Select all dominoes"
        onClick={selectAllDominoes}
      >
        <RiCheckboxMultipleLine size={20} />
      </button>
      <button
        className={styles.iconBtn}
        title="Invert selection"
        aria-label="Invert selection"
        onClick={invertDominoSelection}
      >
        <RiContrastFill size={20} />
      </button>
      <ToolButton
        label={dominoExpanded ? "Shrink dominoes to actual size" : "Expand dominoes to select"}
        Icon={dominoExpanded ? RiCollapseDiagonalLine : RiExpandDiagonalLine}
        active={dominoExpanded}
        onClick={toggleDominoExpanded}
        disabled={!canExpand}
      />

      <span className={styles.separator} aria-hidden="true" />

      {/* Selection modes: which gesture a drag on the canvas draws. Radio
          semantics rather than toggles — Rectangle is the default and is how a
          shape is left, so a shape's own button never turns itself off.
          ToolButton rather than a raw <button> because these are modes, and
          aria-pressed is right for a mode (the same split Expand makes against
          the two commands above).

          Rectangle is deliberately not in SHAPE_SELECTS: it *is* the null
          state, so a registry entry would make "nothing armed" and "rectangle
          armed" two encodings of one thing. Everything after it is
          registry-driven, so adding a shape needs no edit here. */}
      <ToolButton
        label="Rectangle select"
        Icon={RiRectangleLine}
        active={dominoShapeSelectId === null}
        onClick={() => setDominoShapeSelect(null)}
      />
      {SHAPE_SELECT_LIST.map((shape) => (
        <ToolButton
          key={shape.id}
          label={shape.label}
          Icon={shape.icon}
          active={dominoShapeSelectId === shape.id}
          onClick={() => setDominoShapeSelect(shape.id as ShapeSelectId)}
        />
      ))}
    </>
  );
}