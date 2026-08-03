import { useMemo, useState } from "react";
import { RiLockFill } from "@remixicon/react";

import { useStore } from "../store";
import { useDominoDataStore } from "../dominoes/store";
import { useDominoSelectionStore } from "../dominoes/selectionStore";
import { readableTextColor } from "../color";
import FloatingTip from "../components/FloatingTip";
import type { InventoryEntry, InventoryEntryId } from "../domino-inventory/object-model";
import styles from "./DominoColorPanel.module.css";

/**
 * The domino-editing-mode sidebar: a grid of color swatches sourced from the
 * domino inventory, replacing the object hierarchy (DDObjectsPanel) for the
 * duration of the mode (see Sidebar.tsx). Click applies a color to the
 * current domino selection; double-click locks it (DominoEditTool.tsx then
 * auto-applies it to every newly-selected domino); the currently-highlighted
 * swatch tracks either the selection's uniform color or, while a shortcut is
 * being typed, every candidate it could resolve to.
 */
export default function DominoColorPanel() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const inventoryEntries = useStore((s) => s.inventoryEntries);
  const dominoColorLockedId = useStore((s) => s.dominoColorLockedId);
  const dominoColorShortcut = useStore((s) => s.dominoColorShortcut);
  const applyColorToSelectedDominoes = useStore((s) => s.applyColorToSelectedDominoes);
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

  const activeEntries = useMemo(() => inventoryEntries.filter((e) => e.active), [inventoryEntries]);

  // The selected dominoes' shared color id, or null if empty/mixed/unpainted.
  const uniformColorId = useMemo(() => {
    if (!dominoEditingId) return null;
    const selected = useDominoSelectionStore.getState().get(dominoEditingId)?.selected;
    const data = useDominoDataStore.getState().get(dominoEditingId);
    if (!selected || selected.size === 0 || !data) return null;
    let id: number | null = null;
    for (const i of selected) {
      const cid = data.colorIds[i];
      if (id === null) id = cid;
      else if (id !== cid) return null;
    }
    return id === 0 ? null : id; // 0 = unpainted — no swatch represents that
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dominoEditingId, selectionVersion, dataVersion]);

  const matchedEntryId: InventoryEntryId | null = useMemo(() => {
    if (uniformColorId === null) return null;
    return activeEntries.find((e) => e.numericId === uniformColorId)?.id ?? null;
  }, [uniformColorId, activeEntries]);

  // Which swatch is hovered, and where it sits on screen. The tip is rendered
  // once outside the grid rather than inside each button, so it can escape the
  // sidebar's clipping — see FloatingTip.
  const [hovered, setHovered] = useState<{ entry: InventoryEntry; anchor: DOMRect } | null>(null);

  const shortcutCandidates: Set<InventoryEntryId> | null = dominoColorShortcut
    ? new Set(
        activeEntries
          .filter((e) => e.shortcut.toUpperCase().startsWith(dominoColorShortcut))
          .map((e) => e.id),
      )
    : null;

  if (!dominoEditingId) return null;

  const onSwatchClick = (entry: InventoryEntry) => {
    if (dominoColorLockedId && dominoColorLockedId !== entry.id) {
      toggleDominoColorLock(dominoColorLockedId); // unlock the old one
    }
    applyColorToSelectedDominoes(entry.id);
  };

  return (
    <div className={styles.panel}>
      {activeEntries.map((entry) => {
        const isHighlighted = shortcutCandidates
          ? shortcutCandidates.has(entry.id)
          : entry.id === matchedEntryId;
        const isLocked = dominoColorLockedId === entry.id;
        const textColor = readableTextColor(entry.color);

        return (
          <div key={entry.id} className={styles.cell}>
            <button
              className={isHighlighted ? `${styles.swatch} ${styles.highlighted}` : styles.swatch}
              style={{ background: entry.color, color: textColor }}
              onClick={() => onSwatchClick(entry)}
              onDoubleClick={() => toggleDominoColorLock(entry.id)}
              onMouseEnter={(e) =>
                setHovered({ entry, anchor: e.currentTarget.getBoundingClientRect() })
              }
              onMouseLeave={() => setHovered((h) => (h?.entry.id === entry.id ? null : h))}
              onFocus={(e) => setHovered({ entry, anchor: e.currentTarget.getBoundingClientRect() })}
              onBlur={() => setHovered((h) => (h?.entry.id === entry.id ? null : h))}
              aria-label={entry.colorName}
            >
              <span>{entry.shortcut}</span>
              {isLocked && <RiLockFill className={styles.lockBadge} />}
            </button>
            <div className={styles.label}>{entry.colorName}</div>
          </div>
        );
      })}

      {hovered && (
        <FloatingTip anchor={hovered.anchor}>
          {hovered.entry.colorName} — {hovered.entry.material}, {hovered.entry.finish},{" "}
          {hovered.entry.brand}
        </FloatingTip>
      )}
    </div>
  );
}