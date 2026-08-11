import { useEffect } from "react";
import { useShallow } from "zustand/shallow";

import { useClipboardStore } from "./store";
import type { CutCopyHandler, PasteHandler } from "./object-model";

/**
 * Register this component as the active cut/copy source for as long as it's
 * mounted. Pass null to register nothing (a component that's mounted but not
 * currently the active context — DominoEditor outside domino editing mode).
 *
 * Callers must memoize `handler`, or it re-registers every render. The memo's
 * deps double as the reactivity signal for enablement — see
 * useClipboardCapabilities below.
 */
export function useCutCopyHandler(handler: CutCopyHandler | null) {
  useEffect(() => {
    if (!handler) return;
    useClipboardStore.getState().setCutCopyHandler(handler);
    return () => {
      // Identity guard: React can mount a replacement registrant before
      // unmounting the old one, so an unconditional clear here would wipe the
      // *newer* registration and silently disable the clipboard.
      if (useClipboardStore.getState().cutCopyHandler === handler) {
        useClipboardStore.getState().setCutCopyHandler(null);
      }
    };
  }, [handler]);
}

/** Paste-side twin of useCutCopyHandler; same memoization and guard rules. */
export function usePasteHandler(handler: PasteHandler | null) {
  useEffect(() => {
    if (!handler) return;
    useClipboardStore.getState().setPasteHandler(handler);
    return () => {
      if (useClipboardStore.getState().pasteHandler === handler) {
        useClipboardStore.getState().setPasteHandler(null);
      }
    };
  }, [handler]);
}

/**
 * Reactive enablement for Cut/Copy/Paste buttons.
 *
 * The store's canCopy/canCut/canPaste are imperative reads, so calling them
 * during render wouldn't re-render when the underlying selection changes. What
 * makes this work is a discipline on the *registrant* side rather than a
 * capability-version counter here: a registrant re-registers a fresh handler
 * object whenever its answers could have changed (its useMemo deps include the
 * selection version), so handler identity is itself the change signal. This
 * subscribes to both handlers and the item, and re-reads the answers whenever
 * any of the three changes identity.
 *
 * useShallow is required, not stylistic: this returns a fresh object literal
 * every call, which without it makes useSyncExternalStore treat every render as
 * a store change (React #185 — see CLAUDE.md).
 */
export function useClipboardCapabilities(): {
  canCut: boolean;
  canCopy: boolean;
  canPaste: boolean;
} {
  return useClipboardStore(
    useShallow((s) => ({
      canCut: s.cutCopyHandler?.canCut() ?? false,
      canCopy: s.cutCopyHandler?.canCopy() ?? false,
      canPaste: !!s.item && !!s.pasteHandler && s.pasteHandler.canPaste(s.item),
    })),
  );
}