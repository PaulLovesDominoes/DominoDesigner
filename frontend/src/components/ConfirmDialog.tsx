import { useEffect } from "react";

import styles from "./ConfirmDialog.module.css";

interface Props {
  message: string;
  /**
   * Label for the destructive/affirmative action. Leave it out — along with
   * onConfirm — for a dialog that only has something to say; see below.
   */
  confirmLabel?: string;
  /** Label for backing out — also what Escape and a scrim click do. */
  cancelLabel: string;
  onConfirm?: () => void;
  onCancel: () => void;
  /**
   * A roomier dialog, for a message that is a list rather than a sentence — the
   * inventory upload's summary of skipped rows and adjusted values, which is
   * unreadable at the default width. Opt-in so every existing caller keeps the
   * width it was written for.
   */
  wide?: boolean;
}

/**
 * A modal yes/no prompt. Deliberately generic and owned by whoever raises it
 * (local state, mounted inline) rather than living in the store: unlike the
 * properties dialog there is no shared editing session behind it, just a
 * question and two callbacks.
 *
 * Escape and a scrim click both map to onCancel — always the non-destructive
 * direction, so a reflexive dismissal can never be the one that throws work
 * away. Cancel is the focused default for the same reason. Note this is a
 * genuine modal, unlike PropertiesDialog: nothing behind it stays interactive.
 *
 * **Omit confirmLabel/onConfirm and it becomes an acknowledge-only dialog** —
 * one button, which does what Escape and the scrim already did. That is what
 * keeps this the app's single modal rather than there being a near-identical
 * second one for telling the user something. The dismissing button is `onCancel`
 * in both shapes, so nothing about the keyboard or the scrim changes.
 */
export default function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  wide = false,
}: Props) {
  // Swallows *every* keydown in the capture phase, not just Escape: the window
  // listeners behind this (DominoEditors's Delete, its colour shortcuts, and
  // DesignerScreen's Ctrl chords) would otherwise keep editing the very thing
  // the user is being asked about. stopPropagation alone doesn't disturb the
  // dialog's own keyboard use — Tab moves focus and Enter/Space activate the
  // focused button through default actions, which only preventDefault would
  // suppress, and that is applied to Escape only.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onCancel]);

  return (
    <>
      <div className={styles.scrim} onClick={onCancel} />
      <div
        className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
      >
        <div className={styles.message}>{message}</div>
        <div className={styles.footer}>
          {confirmLabel !== undefined && onConfirm && (
            <button className={styles.button} onClick={onConfirm}>
              {confirmLabel}
            </button>
          )}
          <button className={`${styles.button} ${styles.primary}`} onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
        </div>
      </div>
    </>
  );
}