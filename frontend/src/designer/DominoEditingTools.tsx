import {
  RiCheckboxMultipleLine,
  RiCollapseDiagonalLine,
  RiContrastFill,
  RiExpandDiagonalLine,
  RiRectangleLine,
} from "@remixicon/react";

import { useStore } from "../store";
import { getDDObjectBounds, getDominoExpansion } from "../object-types/registry";
import { SHAPE_SELECT_LIST, type ShapeSelectId } from "../shape-select/registry";
import { DOMINO_BRUSH_LIST } from "../paint-brush/registry";
import ImageOverlayButton from "../image-map/ImageOverlayButton";
import DominoBrushButton from "./DominoBrushButton";
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
  // Only so Rectangle can tell "no shape armed" from "the rectangle band is
  // what a drag actually does" — see its button below.
  const dominoBrushId = useStore((s) => s.dominoBrushId);
  const imageMapActive = useStore((s) => s.imageMapActive);
  // Resize and Move, the other thing that can own a canvas drag. Read only so
  // Rectangle can tell whether it is the gesture a drag currently draws.
  const imageTransformActive = useStore((s) => s.imageTransformActive);

  if (!dominoEditingId) return null;

  // The element type both decides how much its dominoes grow and, by declining
  // to answer, says they can't grow at all — a field with no spacing has nowhere
  // to expand into.
  const canExpand = !!ddObject && !!getDominoExpansion(ddObject);
  // A picture is placed against the element's footprint, so a type reporting
  // none can't have one at all.
  const canHoldImage = !!ddObject && !!getDDObjectBounds(ddObject);

  // Everything except the image control is disabled while colours are being
  // mapped — disabled rather than hidden, so the user can see what the mode has
  // switched off and where it comes back. Unlike an armed shape or brush, that
  // mode takes the whole toolbar rather than only what a canvas drag does.
  //
  // Note this is *not* about a picture being on screen. Showing one leaves
  // everything here working, which is the whole point of being able to trace
  // over it; only the mapping mode switches things off.
  const off = imageMapActive;

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
        disabled={off}
      >
        <RiCheckboxMultipleLine size={20} />
      </button>
      <button
        className={styles.iconBtn}
        title="Invert selection"
        aria-label="Invert selection"
        onClick={invertDominoSelection}
        disabled={off}
      >
        <RiContrastFill size={20} />
      </button>
      <ToolButton
        label={dominoExpanded ? "Shrink dominoes to actual size" : "Expand dominoes to select"}
        Icon={dominoExpanded ? RiCollapseDiagonalLine : RiExpandDiagonalLine}
        active={dominoExpanded}
        onClick={toggleDominoExpanded}
        // The one tool that stays live in image mapping mode. It is a view aid
        // rather than something that edits dominoes, and it is genuinely useful
        // there — lining a picture up against a grid is easier when the dominoes
        // tile edge to edge. Safe because it changes only how big a domino is
        // *drawn*: a mapping run measures each domino's patch from the type's own
        // dominoExpansion rather than from this toggle, so what it paints is the
        // same either way.
        disabled={!canExpand}
      />

      {/* The picture, immediately to the right of Expand. A fixed control in the
          fixed group, so it keeps its place as shapes and brushes are registered
          — same reasoning as the two commands above it.

          A button plus its own menu rather than a ToolButton, because a picture
          is no longer one mode to switch on and off. Showing one is an ordinary
          overlay that leaves every tool here working, which is what makes
          tracing a logo possible; mapping its colours is a mode, and is one
          entry in the menu. Like Expand it stays live in that mode, since the
          transparency and layer controls are the ones a user reaches for most
          while lining a picture up. */}
      <ImageOverlayButton disabled={!canHoldImage} />

      <span className={styles.separator} aria-hidden="true" />

      {/* Selection modes: which gesture a drag on the canvas draws. Radio
          semantics rather than toggles — Rectangle is the default and is how a
          shape is left, so a shape's own button never turns itself off.
          ToolButton rather than a raw <button> because these are modes, and
          aria-pressed is right for a mode (the same split Expand makes against
          the two commands above).

          Rectangle stays first because it is this group's default — the null
          state a shape is always left back to. It is deliberately not in
          SHAPE_SELECTS: a registry entry would make "nothing armed" and
          "rectangle armed" two encodings of one thing. Everything after it is
          registry-driven, so adding a shape needs no edit here.

          Its highlight has to test everything else that can own a drag, and the
          reason is not visible in the expression: a null dominoShapeSelectId
          means "no *shape* armed", which stopped meaning "a drag draws the
          rectangle band" once brushes existed — arming a brush sets that same
          field to null to keep the two mutually exclusive, and so do the two
          image sub-modes. Without the other tests, any of them would light this
          button up too, leaving two tools looking armed at once.

          It stays *enabled* while a brush is armed, though: clicking it is one
          of the two ways out of a brush (the other is Escape), since
          setDominoShapeSelect clears dominoBrushId in turn. */}
      <ToolButton
        label="Rectangle select"
        Icon={RiRectangleLine}
        active={
          dominoShapeSelectId === null &&
          dominoBrushId === null &&
          !imageMapActive &&
          !imageTransformActive
        }
        onClick={() => setDominoShapeSelect(null)}
        disabled={off}
      />
      {SHAPE_SELECT_LIST.map((shape) => (
        <ToolButton
          key={shape.id}
          label={shape.label}
          Icon={shape.icon}
          active={dominoShapeSelectId === shape.id}
          onClick={() => setDominoShapeSelect(shape.id as ShapeSelectId)}
          disabled={off}
        />
      ))}

      <span className={styles.separator} aria-hidden="true" />

      {/* Paint brushes: freehand tools that lay down the selected colour as you
          drag, rather than selecting a region for a swatch click to fill. Same
          radio semantics as the shapes above and mutually exclusive with them —
          both interpret canvas drags, so arming either disarms the other. Each
          brings its own size menu, hence a component rather than a ToolButton.

          Both gesture groups grow as variants are registered, so the fixed
          commands stay pinned at the front and everything that grows sits behind
          them. When either group outgrows a flat row, the NewElementMenu-style
          popup swap is one file, since both are already registry-driven. */}
      {DOMINO_BRUSH_LIST.map((brush) => (
        <DominoBrushButton key={brush.id} brush={brush} disabled={off} />
      ))}
    </>
  );
}