import { useMemo, useState, type MouseEvent } from "react";
import { RiArrowDownSLine } from "@remixicon/react";

import { useStore } from "../store";
import type { DominoSwatchId } from "../dominoes/swatches";
import type { InventoryEntryId } from "../domino-inventory/object-model";
import { isImageMapColorPicked } from "../image-map/palette";
import FloatingTip from "../components/FloatingTip";
import DominoSwatchMenu from "./DominoSwatchMenu";
import { dominoSwatches, type DominoSwatch } from "./dominoSwatches";
import styles from "./DominoColorPanel.module.css";

/**
 * The domino-editing-mode sidebar: a grid of swatches replacing the object
 * hierarchy (DDObjectsPanel) for the duration of the mode (see Sidebar.tsx).
 *
 * Clicking a swatch does two things at once: it applies that swatch to whatever
 * dominoes are selected, and it becomes the *selected swatch* — the colour a
 * paint brush lays down. The accent outline marks it. One click, both effects;
 * there was once a double-click that "locked" a colour so every later selection
 * was repainted, and it is gone (see the store's dominoSelectedSwatchId).
 *
 * Both halves happen in every mode, a paint brush in hand included: a brush's
 * hover footprint is not the selection (see dominoes/selectionStore.ts), so
 * dominoes picked out with Ctrl+A or a swatch menu are still there to be
 * coloured while a brush is held.
 *
 * Every swatch presses in while held, and flashes when picked from the keyboard,
 * so a click that changes nothing visible on the build plane — re-applying the
 * colour the selection already has — still reads as a click that landed.
 *
 * The caret beside each swatch opens its per-swatch selection commands.
 *
 * Hide and Unassigned sit at the top and are swatches in every respect — they
 * are selected, they apply, they have menus. Only three things distinguish them:
 * they carry no hover tip, their labels name keys rather than typeable
 * shortcuts, and Hide alone offers Unhide in its menu.
 *
 * Image mapping gives the panel two further states, chosen by the Use Colors
 * dropdown above it (image-map/ImageColorScopeBar). On "all" the swatches are
 * shown but do nothing; on "selected" they become tick boxes choosing which
 * colours a mapping run may use. Both drop the two specials, which mean nothing
 * to a palette, and both drop the carets, since every item in a swatch's menu
 * changes which dominoes are selected and nothing in this mode acts on a
 * selection.
 */
export default function DominoColorPanel() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const inventoryEntries = useStore((s) => s.inventoryEntries);
  const dominoSelectedSwatchId = useStore((s) => s.dominoSelectedSwatchId);
  const dominoColorShortcut = useStore((s) => s.dominoColorShortcut);
  const pickDominoSwatch = useStore((s) => s.pickDominoSwatch);
  // Set for a moment after a swatch is picked from the keyboard, so a shortcut
  // key flashes the same button a mouse click presses. A click needs nothing
  // stored — CSS :active covers it.
  const dominoPressedSwatchId = useStore((s) => s.dominoPressedSwatchId);
  const imageMapActive = useStore((s) => s.imageMapActive);
  const imageMapColorScope = useStore((s) => s.imageMapColorScope);
  const imageMapExcludedColorIds = useStore((s) => s.imageMapExcludedColorIds);
  const toggleImageMapColor = useStore((s) => s.toggleImageMapColor);

  // Picking: the swatches choose which colours a mapping run may use. Inert:
  // image mapping is on but using every colour, so they are shown and do
  // nothing. Inert rather than `disabled`, because a disabled button takes no
  // pointer events in most browsers, which would silently kill the hover tip.
  const picking = imageMapActive && imageMapColorScope === "selected";
  const inert = imageMapActive && !picking;

  // No Hide or Unassigned swatch while image mapping is on, which is also what
  // makes every swatch below an inventory entry in both of those states.
  const swatches = useMemo(
    () => dominoSwatches(inventoryEntries, !imageMapActive),
    [inventoryEntries, imageMapActive],
  );

  // Which swatch is hovered, and where it sits on screen. The tip is rendered
  // once outside the grid rather than inside each button, so it can escape the
  // sidebar's clipping — see FloatingTip.
  const [hovered, setHovered] = useState<{ swatch: DominoSwatch; anchor: DOMRect } | null>(null);
  // The swatch whose caret menu is open, and that caret's rect. null = closed.
  const [menu, setMenu] = useState<{ swatch: DominoSwatch; anchor: DOMRect } | null>(null);

  // Only inventory entries have a typeable shortcut, so the specials never
  // light up here however the buffer reads.
  const shortcutCandidates: Set<DominoSwatchId> | null = dominoColorShortcut
    ? new Set(
        inventoryEntries
          .filter((e) => e.active && e.shortcut.toUpperCase().startsWith(dominoColorShortcut))
          .map((e) => e.id as DominoSwatchId),
      )
    : null;

  if (!dominoEditingId) return null;

  const openMenu = (swatch: DominoSwatch) => (e: MouseEvent<HTMLButtonElement>) => {
    // The caret sits inside .cell alongside the swatch button, not inside it —
    // a button can't nest — so nothing here would apply the swatch anyway. Kept
    // explicit so a later restructure can't silently reintroduce that.
    e.stopPropagation();
    setMenu({ swatch, anchor: e.currentTarget.getBoundingClientRect() });
  };

  return (
    <div className={styles.panel}>
      {swatches.map((swatch) => {
        // While a shortcut is part-typed the candidates take the outline, so the
        // user can see what they are narrowing towards; the moment the buffer
        // resolves and clears, it settles onto the swatch that matched — which
        // is the same swatch the match just selected.
        //
        // The same ring marks a ticked swatch while picking a mapping palette.
        // Reusing it is safe because it has no other meaning in that state: the
        // selected swatch is a paint brush's colour, and no brush can be armed
        // while image mapping is on.
        const isHighlighted = picking
          ? isImageMapColorPicked(imageMapExcludedColorIds, swatch.id as InventoryEntryId)
          : !inert &&
            (shortcutCandidates
              ? shortcutCandidates.has(swatch.id)
              : swatch.id === dominoSelectedSwatchId);
        const isMenuOpen = menu?.swatch.id === swatch.id;

        return (
          <div key={swatch.id} className={styles.cell}>
            {/* The outline goes on the row so it rings the swatch and its caret
                together; on the swatch alone the caret painted over its right
                edge and the ring looked broken open. */}
            <div
              className={
                isHighlighted ? `${styles.swatchRow} ${styles.highlighted}` : styles.swatchRow
              }
            >
              <button
                className={
                  [
                    styles.swatch,
                    swatch.id === dominoPressedSwatchId ? styles.pressed : "",
                    inert ? styles.inert : "",
                    // The caret closes up the swatch's right-hand edge, so a
                    // swatch drawn without one has to close itself.
                    imageMapActive ? styles.noCaret : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                style={{ background: swatch.background, color: swatch.textColor }}
                // Picking a mapping palette is the one state where a click can
                // un-pick. Everywhere else a click always picks: clicking the
                // swatch already selected is a harmless re-apply, and a toggle
                // would make a paint brush go inert on a second click.
                //
                // The cast holds because dominoSwatches leaves the two specials
                // out whenever image mapping is on, so every swatch here is an
                // inventory entry.
                onClick={
                  picking
                    ? () => toggleImageMapColor(swatch.id as InventoryEntryId)
                    : inert
                      ? undefined
                      : () => pickDominoSwatch(swatch.id)
                }
                aria-pressed={picking ? isHighlighted : undefined}
                aria-disabled={inert || undefined}
                onMouseEnter={(e) =>
                  swatch.tip && setHovered({ swatch, anchor: e.currentTarget.getBoundingClientRect() })
                }
                onMouseLeave={() => setHovered((h) => (h?.swatch.id === swatch.id ? null : h))}
                onFocus={(e) =>
                  swatch.tip && setHovered({ swatch, anchor: e.currentTarget.getBoundingClientRect() })
                }
                onBlur={() => setHovered((h) => (h?.swatch.id === swatch.id ? null : h))}
                aria-label={swatch.name}
              >
                <span>{swatch.shortcutLabel}</span>
                {/* The ring alone would say "ticked" only by contrast with its
                    neighbours, which fails when every swatch is ticked or none
                    is. The tick is drawn in the swatch's own readable text
                    colour, so it stays visible on any colour in the inventory. */}
                {picking && isHighlighted && <span className={styles.check}>✓</span>}
              </button>
              {/* No caret at all while image mapping is on: every item in that
                  menu changes which dominoes are selected, and nothing in this
                  mode acts on a selection. */}
              {!imageMapActive && (
                <button
                  className={isMenuOpen ? `${styles.caret} ${styles.caretOpen}` : styles.caret}
                  onClick={openMenu(swatch)}
                  aria-label={`Actions for ${swatch.name}`}
                  aria-haspopup="menu"
                  title="Actions"
                >
                  <RiArrowDownSLine size={14} />
                </button>
              )}
            </div>
            <div className={styles.label}>{swatch.name}</div>
          </div>
        );
      })}

      {hovered?.swatch.tip && (
        <FloatingTip anchor={hovered.anchor}>{hovered.swatch.tip}</FloatingTip>
      )}

      {menu && !imageMapActive && (
        <DominoSwatchMenu
          swatch={menu.swatch}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}