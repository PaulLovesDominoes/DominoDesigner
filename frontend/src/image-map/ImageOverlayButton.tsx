import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  RiArrowDownSLine,
  RiAspectRatioLine,
  RiBringToFront,
  RiDeleteBinLine,
  RiDragMove2Line,
  RiEyeLine,
  RiEyeOffLine,
  RiImageAddLine,
  RiImageLine,
  RiMagicLine,
  RiSendToBack,
} from "@remixicon/react";

import { useStore } from "../store";
import ConfirmDialog from "../components/ConfirmDialog";
import toolbarStyles from "../designer/Toolbar.module.css";
import { getDDObjectBounds } from "../object-types/registry";
import { loadImageForElement } from "./loadImage";
import { coverPlacement, imageOriginFor } from "./object-model";
import { imageMadeOnScreen } from "./visibility";
import styles from "./ImageOverlayButton.module.css";

/**
 * The toolbar's picture control for domino editing mode: a button that shows or
 * hides the overlay, and a caret beside it opening everything else that can be
 * done with one.
 *
 * A picture is two quite different tools wearing one hat. It is **tracing
 * paper** — laid under the dominoes so a logo can be drawn by hand with the
 * shape and brush tools — and it is the **source for colour mapping**. Only the
 * second is a mode; the first is just something switched on while ordinary
 * editing carries on. That is why this lives on the toolbar rather than in the
 * mapping sidebar, and why Map Image Colors is only one entry in its menu.
 *
 * Two buttons rather than one, because they do different things: the icon acts
 * (load a picture, or show and hide the one already there) and the caret opens
 * the menu. They cannot be nested — .iconBtn is itself a <button> — so they are
 * siblings sharing a wrapper, as DominoColorPanel's swatch and caret are.
 *
 * It borrows Toolbar.module.css's .iconBtn/.iconBtnWithCaret/.active rather than
 * keeping a byte-identical copy. What it can't borrow is ToolButton, which takes
 * no ref to anchor a popup to and emits no aria-haspopup/aria-expanded — the
 * same argument DominoBrushButton makes.
 */

const GLYPH_PX = 20;
const CARET_PX = 14;
const ITEM_GLYPH_PX = 16;

export default function ImageOverlayButton({ disabled }: { disabled?: boolean }) {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  // The store's own stable reference, not a computed object, so no useShallow.
  const image = useStore((s) => (s.dominoEditingId ? s.imageMaps[s.dominoEditingId] : undefined));
  // Needed by Reset size, which measures the element to work out what "cover it"
  // comes to. Another stable store reference, so again no useShallow.
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));
  const imageMapActive = useStore((s) => s.imageMapActive);
  const imageTransformActive = useStore((s) => s.imageTransformActive);
  const setImageMapActive = useStore((s) => s.setImageMapActive);
  const setImageTransformActive = useStore((s) => s.setImageTransformActive);
  const updateImageMap = useStore((s) => s.updateImageMap);
  const toggleImageVisible = useStore((s) => s.toggleImageVisible);
  const clearImageMap = useStore((s) => s.clearImageMap);
  const recordImageMapChange = useStore((s) => s.recordImageMapChange);
  const setImageMapMessage = useStore((s) => s.setImageMapMessage);

  const groupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  // Asked before New Image replaces one already loaded. Owned here and mounted
  // inline — ConfirmDialog is deliberately not store state.
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  // Anchored to the whole control rather than to either button, so the menu
  // lines up with the pair. Measured rather than hard-coded because the screen
  // position depends on the sidebar's width and on what else the toolbar holds.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = groupRef.current?.getBoundingClientRect();
    if (!anchor) return;
    setPos({ left: anchor.left, top: anchor.bottom + 4 });
  }, [open]);

  // Escape closes the menu and does nothing else. DominoEditor runs a whole
  // ladder off Escape and ImageTransformTool uses it to leave Resize and Move,
  // both from window listeners — so without this, dismissing this menu would
  // also back out of whatever is underneath it. Claiming the key in the capture
  // phase (the `true` argument) means this handler runs before those; only this
  // one key is claimed, since a menu is a popup rather than a modal and has no
  // business swallowing the rest.
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

  if (!dominoEditingId) return null;

  const loadImage = () => loadImageForElement(dominoEditingId);

  const onNewImage = () => {
    if (image) setConfirmingReplace(true);
    else void loadImage();
  };

  const toggleVisible = () => {
    if (!image) return;
    setImageMapMessage(null);
    toggleImageVisible(dominoEditingId);
  };

  /**
   * Puts the picture back to the size a freshly loaded one gets — scaled to
   * cover the element's boundary box, at the file's own proportions — while
   * leaving it where the user has put it.
   *
   * The point of it is an edge grip, which stretches the picture out of shape
   * (only a corner grip holds the proportions). There is no other way back.
   *
   * It keeps the *centre* rather than the stored x/y, which is the lower-left
   * corner: growing out of one corner would shift the picture across the field,
   * and "reset the size" should not move anything.
   *
   * It also brings the picture back on screen, for the same reason entering
   * Resize and Move does — there is no judging a size you cannot see.
   *
   * That is why both sides of the recorded pair are built from `shown` rather
   * than from the record as it stands. Recording the hidden original against a
   * visible result would push an entry whose only real difference is visibility,
   * and undoing it would appear to do nothing: undo forces any record it writes
   * on screen (see history/appStoreSlice.ts), so the picture would come back
   * looking exactly as it does now. Comparing like with like means resetting a
   * picture already at this size records nothing at all, whether it was hidden
   * or not.
   *
   * Recorded after the change, not before — the exception in
   * recordImageMapChange's rule only applies when a picture is being dropped or
   * swapped, and this is the same picture throughout.
   */
  const resetImageSize = () => {
    if (!image || !ddObject) return;
    const bounds = getDDObjectBounds(ddObject);
    const origin = imageOriginFor(ddObject);
    if (!bounds || !origin) return;
    const { width, height } = coverPlacement(
      bounds,
      origin,
      image.naturalWidth,
      image.naturalHeight,
    );
    const shown = imageMadeOnScreen(image);
    const after = {
      ...shown,
      x: image.x + image.width / 2 - width / 2,
      y: image.y + image.height / 2 - height / 2,
      width,
      height,
    };
    const store = useStore.getState();
    store.setImageMap(dominoEditingId, after);
    store.recordImageMapChange(dominoEditingId, shown, after);
  };

  const deleteImage = () => {
    if (!image) return;
    // Recorded first — see recordImageMapChange. Clearing first would leave the
    // picture referenced by nothing for one store write, and the pruner would
    // free the very pixels this undo entry exists to bring back.
    recordImageMapChange(dominoEditingId, image, null);
    clearImageMap(dominoEditingId);
  };

  /** Runs a menu command and closes the menu, which every command does. */
  const runAndClose = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  const showing = !!image && image.visible;

  return (
    <>
      <div className={styles.group} ref={groupRef}>
        <button
          className={
            showing ? `${toolbarStyles.iconBtn} ${toolbarStyles.active}` : toolbarStyles.iconBtn
          }
          onClick={image ? toggleVisible : () => void loadImage()}
          disabled={disabled}
          title={
            !image
              ? "Add an image to trace over or map colors from (Ctrl+I)"
              : image.visible
                ? "Hide the image (Ctrl+I)"
                : "Show the image (Ctrl+I)"
          }
          aria-label={!image ? "Add image" : image.visible ? "Hide image" : "Show image"}
          aria-pressed={image ? image.visible : undefined}
        >
          <RiImageLine size={GLYPH_PX} />
        </button>
        <button
          className={`${toolbarStyles.iconBtn} ${toolbarStyles.iconBtnCaretOnly}`}
          onClick={() => {
            // Any complaint from an earlier failed load is stale the moment the
            // user comes back to this control, and it occupies the hint bar
            // until something clears it.
            setImageMapMessage(null);
            setOpen((o) => !o);
          }}
          disabled={disabled}
          title="Image options"
          aria-label="Image options"
          aria-haspopup="true"
          aria-expanded={open}
        >
          {/* aria-hidden because aria-haspopup already announces there is a menu. */}
          <RiArrowDownSLine size={CARET_PX} aria-hidden="true" />
        </button>
      </div>

      {open && (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          {/* Deliberately role="group" rather than role="menu". A menu's children
              are supposed to be menu items, and the transparency slider is not
              one — announcing it as a menu would describe the popup wrongly to a
              screen reader. */}
          <div className={styles.menu} style={pos} role="group" aria-label="Image">
            {/* Transparency first, and it is a control rather than a command, so
                it does not close the menu — dragging inside the popup never
                reaches the backdrop, so this needs no special handling. */}
            <div className={styles.sliderRow}>
              <div className={styles.sliderLabel}>
                <span>Transparency</span>
                <span>{image ? `${Math.round((1 - image.opacity) * 100)}%` : "—"}</span>
              </div>
              {/* Expressed as transparency to match the label, so the slider
                  reads left-to-right as more see-through; opacity is what gets
                  stored. */}
              <input
                className={styles.slider}
                type="range"
                min={0}
                max={100}
                value={image ? Math.round((1 - image.opacity) * 100) : 0}
                disabled={!image}
                onChange={(e) =>
                  updateImageMap(dominoEditingId, { opacity: 1 - Number(e.target.value) / 100 })
                }
                aria-label="Image transparency"
              />
            </div>

            <div className={styles.separator} />

            <button
              className={
                imageTransformActive ? `${styles.item} ${styles.on}` : styles.item
              }
              onClick={runAndClose(() => setImageTransformActive(!imageTransformActive))}
              disabled={!image}
              aria-pressed={imageTransformActive}
            >
              <RiDragMove2Line size={ITEM_GLYPH_PX} />
              Resize and Move
            </button>
            <button className={styles.item} onClick={runAndClose(toggleVisible)} disabled={!image}>
              {image?.visible ? (
                <RiEyeOffLine size={ITEM_GLYPH_PX} />
              ) : (
                <RiEyeLine size={ITEM_GLYPH_PX} />
              )}
              {image?.visible ? "Hide" : "Unhide"}
            </button>
            <button
              className={styles.item}
              onClick={runAndClose(() =>
                updateImageMap(dominoEditingId, {
                  layer: image?.layer === "above" ? "below" : "above",
                }),
              )}
              disabled={!image}
              title={
                image?.layer === "above"
                  ? "The image is above every domino. Click to put it behind the colored ones."
                  : "The image is behind the colored dominoes. Click to put it above every domino."
              }
            >
              {image?.layer === "above" ? (
                <RiSendToBack size={ITEM_GLYPH_PX} />
              ) : (
                <RiBringToFront size={ITEM_GLYPH_PX} />
              )}
              {image?.layer === "above" ? "Show Under" : "Show Over"}
            </button>
            {/* Sits with the other things that change how the picture appears
                rather than with Resize and Move, because it needs no mode — it
                is one command, not a gesture. */}
            <button className={styles.item} onClick={runAndClose(resetImageSize)} disabled={!image}>
              <RiAspectRatioLine size={ITEM_GLYPH_PX} />
              Reset Size
            </button>

            <div className={styles.separator} />

            <button
              className={imageMapActive ? `${styles.item} ${styles.on}` : styles.item}
              onClick={runAndClose(() => setImageMapActive(!imageMapActive))}
              disabled={!image}
              aria-pressed={imageMapActive}
            >
              <RiMagicLine size={ITEM_GLYPH_PX} />
              Map Image Colors
            </button>

            <div className={styles.separator} />

            {/* The only entry that stays available with nothing loaded — there
                is nothing else to do to a picture that isn't there. */}
            <button className={styles.item} onClick={runAndClose(onNewImage)}>
              <RiImageAddLine size={ITEM_GLYPH_PX} />
              New Image…
            </button>
            <button className={styles.item} onClick={runAndClose(deleteImage)} disabled={!image}>
              <RiDeleteBinLine size={ITEM_GLYPH_PX} />
              Delete
            </button>
          </div>
        </>
      )}

      {confirmingReplace && (
        <ConfirmDialog
          message="This element already has an image. Loading a new one replaces it."
          confirmLabel="Choose a new image"
          cancelLabel="Keep the current image"
          onConfirm={() => {
            setConfirmingReplace(false);
            void loadImage();
          }}
          onCancel={() => setConfirmingReplace(false)}
        />
      )}
    </>
  );
}