import { useStore } from "../store";
import { useDominoSelectionStore } from "./selectionStore";
import { canPasteDominoColors } from "./rowColPaste";
import type { ClipboardItem, CutCopyHandler, PasteHandler } from "../clipboard/object-model";

/** Is there a domino selection to act on right now? */
function hasSelection(): boolean {
  const parentId = useStore.getState().dominoEditingId;
  if (!parentId) return false;
  const entry = useDominoSelectionStore.getState().get(parentId);
  return !!entry && entry.selected.size > 0;
}

/**
 * The domino-editing context's clipboard handlers, registered by DominoEditTool
 * for as long as the mode is active (see clipboard/object-model.ts for the
 * registration seam).
 *
 * Thin by design: the actual work lives in the store actions, which need the
 * undo stack anyway. These read live state through getState() rather than
 * closing over it, so a handler instance stays correct for as long as it's
 * registered — its identity only needs to change to signal *enablement* may
 * have changed, which is DominoEditTool's useMemo deps' job.
 */
export function makeDominoColorClipboardHandlers(): {
  cutCopy: CutCopyHandler;
  paste: PasteHandler;
} {
  const cutCopy: CutCopyHandler = {
    id: "dominoColors",
    canCopy: hasSelection,
    canCut: hasSelection,
    copy: () => useStore.getState().copySelectedDominoColors(),
    cut: () => useStore.getState().cutSelectedDominoColors(),
  };

  const paste: PasteHandler = {
    id: "dominoColors",
    canPaste: (item: ClipboardItem) => {
      if (item.type !== "dominoColors") return false;
      if (!hasSelection()) return false;
      const s = useStore.getState();
      const ddObject = s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined;
      // Capability, not type: any element declaring a row/col mapping can
      // receive this, whatever kind of element produced it.
      return !!ddObject && canPasteDominoColors(ddObject);
    },
    paste: (item: ClipboardItem) => {
      if (item.type !== "dominoColors") return;
      useStore.getState().pasteDominoColorClipboard(item);
    },
  };

  return { cutCopy, paste };
}