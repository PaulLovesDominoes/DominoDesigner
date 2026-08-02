import { create } from "zustand";

import type { ClipboardItem, CutCopyHandler, PasteHandler } from "./object-model";

/**
 * The app clipboard: one slot, plus the handler pair the currently-active
 * context has registered. See object-model.ts for why this is a registration
 * seam rather than a static registry.
 *
 * Its own small store rather than a section of the main one, following
 * dominoes/selectionStore.ts's precedent — and because nothing here is
 * undoable, persisted, or part of the DDObject hierarchy. The slot is replaced
 * wholesale, never mutated in place, so it follows the main store's
 * copy-on-write discipline rather than dominoes/store.ts's.
 */
interface ClipboardStore {
  /** The single clipboard slot (null = empty). */
  item: ClipboardItem | null;
  cutCopyHandler: CutCopyHandler | null;
  pasteHandler: PasteHandler | null;

  setCutCopyHandler: (handler: CutCopyHandler | null) => void;
  setPasteHandler: (handler: PasteHandler | null) => void;

  /** The three top-level commands. Each no-ops when it can't act. */
  copy: () => void;
  cut: () => void;
  paste: () => void;

  /**
   * Whether each command would do anything — what a toolbar button or Edit menu
   * binds its disabled state to. All three, not just paste: a Cut button has to
   * grey out on an empty selection exactly as Paste does on an empty clipboard.
   * These are imperative reads; see useClipboardCapabilities for the reactive
   * wrapper.
   */
  canCopy: () => boolean;
  canCut: () => boolean;
  canPaste: () => boolean;
}

export const useClipboardStore = create<ClipboardStore>((set, get) => ({
  item: null,
  cutCopyHandler: null,
  pasteHandler: null,

  setCutCopyHandler: (cutCopyHandler) => set({ cutCopyHandler }),
  setPasteHandler: (pasteHandler) => set({ pasteHandler }),

  copy: () => {
    const handler = get().cutCopyHandler;
    if (!handler || !handler.canCopy()) return;
    const item = handler.copy();
    // Only overwrite the slot on success — a copy that turned out to have
    // nothing to take must not blank a perfectly good existing clipboard.
    if (item) set({ item });
  },

  cut: () => {
    const handler = get().cutCopyHandler;
    if (!handler || !handler.canCut()) return;
    const item = handler.cut();
    if (item) set({ item });
  },

  paste: () => {
    const { item, pasteHandler } = get();
    if (!item || !pasteHandler || !pasteHandler.canPaste(item)) return;
    pasteHandler.paste(item);
  },

  canCopy: () => get().cutCopyHandler?.canCopy() ?? false,
  canCut: () => get().cutCopyHandler?.canCut() ?? false,
  canPaste: () => {
    const { item, pasteHandler } = get();
    return !!item && !!pasteHandler && pasteHandler.canPaste(item);
  },
}));