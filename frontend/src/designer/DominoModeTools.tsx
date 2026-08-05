import {
  RiCheckboxMultipleLine,
  RiCollapseDiagonalLine,
  RiContrast2Line,
  RiExpandDiagonalLine,
} from "@remixicon/react";

import { useStore } from "../store";
import { getDominoExpansion } from "../object-types/registry";
import ToolButton from "./ToolButton";
import styles from "./Toolbar.module.css";

/**
 * The toolbar's domino-editing-mode group, replacing Select and New for the
 * duration of the mode (see Toolbar.tsx) — those two act on the DDObject
 * hierarchy, which the mode is modal against. Kept as its own component, like
 * NewElementMenu, so Toolbar stays a layout file rather than growing a branch
 * per mode-specific button.
 */
export default function DominoModeTools() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));
  const dominoExpanded = useStore((s) => s.dominoExpanded);
  const toggleDominoExpanded = useStore((s) => s.toggleDominoExpanded);
  const selectAllDominoes = useStore((s) => s.selectAllDominoes);
  const invertDominoSelection = useStore((s) => s.invertDominoSelection);

  if (!dominoEditingId) return null;

  // The element type both decides how much its dominoes grow and, by declining
  // to answer, says they can't grow at all — a field with no spacing has nowhere
  // to expand into.
  const canExpand = !!ddObject && !!getDominoExpansion(ddObject);

  return (
    <>
      {/* Raw buttons, not ToolButton: these are commands rather than toggles, so
          the aria-pressed ToolButton always emits would be wrong — the same
          reason Toolbar's undo/redo/zoom are raw. Neither needs a disabled
          state: the store actions no-op safely, inverting an empty selection is
          meaningfully "select everything", and a field can't have zero dominoes
          (createFromRegion rejects anything under one row/column). */}
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
        <RiContrast2Line size={20} />
      </button>
      <ToolButton
        label={dominoExpanded ? "Shrink dominoes to actual size" : "Expand dominoes to select"}
        Icon={dominoExpanded ? RiCollapseDiagonalLine : RiExpandDiagonalLine}
        active={dominoExpanded}
        onClick={toggleDominoExpanded}
        disabled={!canExpand}
      />
    </>
  );
}