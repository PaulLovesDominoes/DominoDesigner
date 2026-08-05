import { useMemo, useState, type MouseEvent } from "react";
import { RiArrowDownSLine, RiLockFill } from "@remixicon/react";

import { useStore } from "../store";
import { useDominoDataStore } from "../dominoes/store";
import { useDominoSelectionStore } from "../dominoes/selectionStore";
import { isHiddenColorId } from "../dominoes/object-model";
import {
  HIDE_SWATCH_ID,
  UNASSIGNED_SWATCH_ID,
  type DominoSwatchId,
} from "../dominoes/swatches";
import FloatingTip from "../components/FloatingTip";
import DominoSwatchMenu from "./DominoSwatchMenu";
import { dominoSwatches, type DominoSwatch } from "./dominoSwatches";
import styles from "./DominoColorPanel.module.css";

/**
 * The domino-editing-mode sidebar: a grid of swatches replacing the object
 * hierarchy (DDObjectsPanel) for the duration of the mode (see Sidebar.tsx).
 * Click applies a swatch to the current domino selection; double-click locks it
 * (DominoEditTool.tsx then auto-applies it to every newly-selected domino); the
 * caret opens per-swatch selection commands; and the highlighted swatch tracks
 * either the selection's shared state or, while a shortcut is being typed, every
 * candidate it could resolve to.
 *
 * Hide and Unassigned sit at the top and are swatches in every respect — they
 * lock, they apply, they have menus. Only three things distinguish them: they
 * carry no hover tip, their labels name keys rather than typeable shortcuts, and
 * Hide alone offers Unhide in its menu.
 */
export default function DominoColorPanel() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const inventoryEntries = useStore((s) => s.inventoryEntries);
  const dominoColorLockedId = useStore((s) => s.dominoColorLockedId);
  const dominoColorShortcut = useStore((s) => s.dominoColorShortcut);
  const applyDominoSwatch = useStore((s) => s.applyDominoSwatch);
  const toggleDominoColorLock = useStore((s) => s.toggleDominoColorLock);

  // Selection/data changes happen imperatively (mutated in place); these
  // version counters are the reactive "please recompute" signal, same
  // pattern dominoes/modeller.tsx's copy effect already uses.
  const selectionVersion = useDominoSelectionStore((s) =>
    dominoEditingId ? s.versions[dominoEditingId] : undefined,
  );
  const dataVersion = useDominoDataStore((s) =>
    dominoEditingId ? s.versions[dominoEditingId] : undefined,
  );

  const swatches = useMemo(() => dominoSwatches(inventoryEntries), [inventoryEntries]);

  /**
   * Which swatch the whole selection currently is, or null if it's empty or
   * mixed. Every domino hidden wins over their underlying colors: hidden is what
   * you see, and it's the state the Hide swatch represents.
   */
  const matchedSwatchId: DominoSwatchId | null = useMemo(() => {
    if (!dominoEditingId) return null;
    const selected = useDominoSelectionStore.getState().get(dominoEditingId)?.selected;
    const data = useDominoDataStore.getState().get(dominoEditingId);
    if (!selected || selected.size === 0 || !data) return null;

    let allHidden = true;
    let sharedId: number | null = null;
    for (const i of selected) {
      const colorId = data.colorIds[i];
      if (!isHiddenColorId(colorId)) allHidden = false;
      if (sharedId === null) sharedId = colorId;
      else if (sharedId !== colorId) sharedId = -1; // mixed
    }
    if (allHidden) return HIDE_SWATCH_ID;
    if (sharedId === null || sharedId < 0) return null;
    // 0 is the unpainted sentinel, which the Unassigned swatch now represents.
    if (sharedId === 0) return UNASSIGNED_SWATCH_ID;
    return inventoryEntries.find((e) => e.numericId === sharedId)?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dominoEditingId, selectionVersion, dataVersion, inventoryEntries]);

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

  const onSwatchClick = (swatch: DominoSwatch) => {
    if (dominoColorLockedId && dominoColorLockedId !== swatch.id) {
      toggleDominoColorLock(dominoColorLockedId); // unlock the old one
    }
    applyDominoSwatch(swatch.id);
  };

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
        const isHighlighted = shortcutCandidates
          ? shortcutCandidates.has(swatch.id)
          : swatch.id === matchedSwatchId;
        const isLocked = dominoColorLockedId === swatch.id;
        const isMenuOpen = menu?.swatch.id === swatch.id;

        return (
          <div key={swatch.id} className={styles.cell}>
            <div className={styles.swatchRow}>
              <button
                className={isHighlighted ? `${styles.swatch} ${styles.highlighted}` : styles.swatch}
                style={{ background: swatch.background, color: swatch.textColor }}
                onClick={() => onSwatchClick(swatch)}
                onDoubleClick={() => toggleDominoColorLock(swatch.id)}
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
                {isLocked && <RiLockFill className={styles.lockBadge} />}
              </button>
              <button
                className={isMenuOpen ? `${styles.caret} ${styles.caretOpen}` : styles.caret}
                onClick={openMenu(swatch)}
                aria-label={`Actions for ${swatch.name}`}
                aria-haspopup="menu"
                title="Actions"
              >
                <RiArrowDownSLine size={14} />
              </button>
            </div>
            <div className={styles.label}>{swatch.name}</div>
          </div>
        );
      })}

      {hovered?.swatch.tip && (
        <FloatingTip anchor={hovered.anchor}>{hovered.swatch.tip}</FloatingTip>
      )}

      {menu && (
        <DominoSwatchMenu
          swatch={menu.swatch}
          anchor={menu.anchor}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}