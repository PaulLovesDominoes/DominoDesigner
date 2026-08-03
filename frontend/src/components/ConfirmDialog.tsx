import { useEffect } from "react";

import styles from "./ConfirmDialog.module.css";

interface Props {
  message: string;
  /** Label for the destructive/affirmative action. */
  confirmLabel: string;
  /** Label for backing out — also what Escape and a scrim click do. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
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
 */
export default function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: Props) {
  // Swallows *every* keydown in the capture phase, not just Escape: the window
  // listeners behind this (DominoEditTool's Delete, its colour shortcuts, and
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
      <div className={styles.dialog} role="alertdialog" aria-modal="true" aria-label={message}>
        <div className={styles.message}>{message}</div>
        <div className={styles.footer}>
          <button className={styles.button} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className={`${styles.button} ${styles.primary}`} onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
        </div>
      </div>
    </>
  );
}