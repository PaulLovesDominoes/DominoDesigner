import type { DominoColorClipboardItem } from "../dominoes/clipboardItem";

/**
 * The app's clipboard contract. Deliberately *not* a static registry like
 * DD_OBJECT_TYPES: which handler is correct depends on live app state (which
 * mode is active, what's selected), not on a type name known at module load.
 * So the active context registers its handlers imperatively — the same pattern
 * CameraRig.tsx already uses to publish its CameraApi — and the top-level
 * Cut/Copy/Paste commands dispatch through whatever is currently registered.
 *
 * The payoff is that a new clipboard client (DDObject cut/paste next) adds an
 * item kind and a handler pair, and writes no keyboard code and no dispatch
 * branching at all.
 */

/**
 * Discriminant for what's on the clipboard. Adding a kind means adding a member
 * here and its item interface to the ClipboardItem union below — the same
 * one-line central edit registering a DDObject type costs. Nothing switches on
 * this outside a PasteHandler deciding whether it can accept an item.
 */
export type ClipboardItemType = "dominoColors";

/**
 * Base shape of anything on the clipboard; concrete items extend it with their
 * own payload.
 *
 * NOTE: the `ClipboardItem` union below shadows lib.dom's own `ClipboardItem`
 * (the async Clipboard API), which is unrelated — nothing here touches
 * navigator.clipboard. Every use site imports this one explicitly.
 */
export interface ClipboardItemBase {
  type: ClipboardItemType;
  /** Human-readable, for the mode hint and any future Edit menu. */
  label: string;
}

/** Union of every registered item kind. Extended alongside ClipboardItemType. */
export type ClipboardItem = DominoColorClipboardItem;

/**
 * What the currently-active context can put on the clipboard, registered by
 * whichever component owns the current selection (DominoEditTool in domino
 * editing mode; SelectionTool for DDObjects, later).
 *
 * Implementations read live state imperatively via getState(), like every other
 * non-React consumer in this codebase — which means `canCopy`/`canCut` are not
 * reactive on their own. UI that enables a button off them subscribes to the
 * handler's *identity*, and registrants re-register a fresh handler whenever
 * their answers could have changed; see useClipboardCapabilities.
 */
export interface CutCopyHandler {
  /** Stable id of the registrant — diagnostics only. */
  readonly id: string;
  /** Is there anything to copy right now? */
  canCopy(): boolean;
  /** Build the item, or undefined if there turned out to be nothing to copy. */
  copy(): ClipboardItem | undefined;
  /**
   * Whether cut is offered at all, kept separate from canCopy because a context
   * can be copy-only (a read-only view), and because DDObject cut may end up
   * gated differently from DDObject copy.
   */
  canCut(): boolean;
  /** Copy AND remove, as one undoable operation. */
  cut(): ClipboardItem | undefined;
}

/**
 * What the currently-active context can accept off the clipboard. Kept separate
 * from CutCopyHandler rather than folded into one optional-membered interface,
 * so a context that only sources or only sinks registers just the half it
 * implements.
 */
export interface PasteHandler {
  readonly id: string;
  /**
   * Can this context accept this item, right now? A false is a silent no-op,
   * not an error — it's the normal answer for an item from another context
   * (domino colors while in select mode), and it's what a Paste command binds
   * its disabled state to.
   */
  canPaste(item: ClipboardItem): boolean;
  /** Apply it, as one undoable operation. */
  paste(item: ClipboardItem): void;
}