import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";

import { useStore } from "../store";
import { DOMINO_BRUSH_SIZES, type DominoBrushDefinition } from "../paint-brush/base";
import type { DominoBrushId } from "../paint-brush/registry";
import styles from "./DominoBrushButton.module.css";
import toolbarStyles from "./Toolbar.module.css";

/**
 * Every glyph here — on the button and in each menu row — is drawn at this one
 * size. The brush's drawings differ from each other *as drawings* (see
 * sizeIcons), so scaling a glyph to imply a size would double the cue and fight
 * it: a Small icon rendered small would shrink its own droplet too.
 */
const GLYPH_PX = 20;

/** The caret beside it, matching every other caret in the app. */
const CARET_PX = 14;

/**
 * One paint brush in the toolbar: a button showing that brush's nib at the size
 * currently chosen, opening its size menu. Rendered once per registered brush by
 * DominoEditingTools, so adding a brush needs no edit here.
 *
 * **The button only opens the menu; the menu arms the brush.** Clicking an armed
 * brush is therefore not a disarm — it just reopens the menu, matching every
 * other tool in this toolbar, none of which turns itself off. The ways out are
 * clicking another tool (each setter clears the other) or Escape.
 *
 * It borrows Toolbar's own .iconBtn/.active chrome rather than keeping a copy,
 * since it is the same 34px single-glyph button those describe. What it can't
 * borrow is ToolButton itself: that takes no ref to anchor a popup to, and emits
 * no aria-haspopup/aria-expanded. Hence the markup by hand, aria-pressed
 * included.
 *
 * **No disabled state, deliberately.** A brush with no selected swatch arms fine
 * and is simply inert — it draws no nib and paints nothing (see DominoEditor's
 * brushCanPaint), and ModeHintBar says so in words. Greying the button out
 * instead made the tool look broken rather than explaining itself: the user has
 * a colour to pick, not a bug to work around, and they can only be told that if
 * the button lets them press it.
 *
 * The popup follows NewElementMenu — local open state, a layout effect measuring
 * the button's own rect (its screen position depends on the sidebar width and
 * the toolbar layout, not a fixed offset), a position:fixed menu and a
 * transparent full-viewport backdrop that closes it.
 */
export default function DominoBrushButton({
  brush,
  disabled,
}: {
  brush: DominoBrushDefinition;
  /**
   * Switched off wholesale by image mapping mode, which owns the canvas for as
   * long as it is on. Note this is a *different* thing from the brush being
   * inert for want of a chosen colour, which is deliberately not a disabled
   * state (see the doc above).
   */
  disabled?: boolean;
}) {
  const brushId = brush.id as DominoBrushId;

  const dominoBrushId = useStore((s) => s.dominoBrushId);
  const setDominoBrush = useStore((s) => s.setDominoBrush);
  const sizeId = useStore((s) => s.dominoBrushSizes[brushId]);
  const setDominoBrushSize = useStore((s) => s.setDominoBrushSize);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const armed = dominoBrushId === brushId;
  // The whole size, not just its id: the tooltip names it.
  const currentSize = DOMINO_BRUSH_SIZES.find((s) => s.id === sizeId) ?? DOMINO_BRUSH_SIZES[0];
  // Capitalised local binding so the JSX below reads as a component rather than
  // as a property access.
  const CurrentSizeIcon = brush.sizeIcons[currentSize.id];

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setPos({ left: anchor.left, top: anchor.bottom + 4 });
  }, [open]);

  // Escape closes the menu and does nothing else. DominoEditor listens for
  // Escape on the window and runs a four-rung ladder off it, so without this an
  // Escape here would disarm the brush while leaving its menu sitting open.
  // Claiming the key in the capture phase is the same answer ConfirmDialog uses
  // against the same window listeners — but only for this one key, since a menu
  // is a popup rather than a modal and has no business swallowing the rest.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        className={
          armed
            ? `${toolbarStyles.iconBtn} ${toolbarStyles.iconBtnWithCaret} ${toolbarStyles.active}`
            : `${toolbarStyles.iconBtn} ${toolbarStyles.iconBtnWithCaret}`
        }
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        // Both, because the control genuinely is both things: a mode that can be
        // on or off, and the trigger for a menu.
        aria-pressed={armed}
        aria-haspopup="menu"
        aria-expanded={open}
        // No millimetres, matching the menu. For the quill a single number would
        // be the nib's length only — its width is fixed separately — so naming
        // one here would describe half the nib.
        title={`${brush.label} — ${currentSize.label}. Click to choose size.`}
        aria-label={brush.label}
      >
        <CurrentSizeIcon size={GLYPH_PX} />
        {/* Says the button opens a menu rather than just toggling — the same
            14px caret the New button and the colour swatches use. aria-hidden
            because aria-haspopup above already announces it; drawing it twice
            would be worse than not at all. */}
        <RiArrowDownSLine size={CARET_PX} aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu} style={pos} role="menu">
            {DOMINO_BRUSH_SIZES.map((brushSize) => {
              const checked = currentSize.id === brushSize.id;
              // Each row draws *its own* size's nib, not the armed one — the
              // three drawings side by side are what the menu is showing.
              const RowIcon = brush.sizeIcons[brushSize.id];
              return (
                <button
                  key={brushSize.id}
                  className={checked ? `${styles.item} ${styles.checked}` : styles.item}
                  role="menuitemradio"
                  aria-checked={checked}
                  onClick={() => {
                    setDominoBrushSize(brushId, brushSize.id);
                    // This is where arming happens — reaching for the size of a
                    // tool is asking to use it. Keeping it here rather than on
                    // the button is what stops a second click on an armed brush
                    // from disarming it.
                    setDominoBrush(brushId);
                    setOpen(false);
                  }}
                >
                  <RowIcon size={GLYPH_PX} />
                  {brushSize.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}