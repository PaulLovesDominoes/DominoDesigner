import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import styles from "./FloatingTip.module.css";

// Gap between the tip and the element it describes, and the minimum distance it
// keeps from the viewport edges.
const GAP = 4;
const MARGIN = 4;

interface Props {
  /** Bounding rect of the element being described, in viewport coordinates. */
  anchor: DOMRect;
  children: ReactNode;
}

/**
 * Hover text that floats free of whatever clips its owner — the sidebar, chiefly,
 * whose overflow makes it a clip box on both axes (see FloatingTip.module.css).
 * Positioned *below* its anchor and centred on it, flipping above and nudging
 * sideways to stay on screen: the same measure-then-clamp pattern DDObjectMenu
 * uses, which is why the CSS `transform: translateX(-50%)` centring trick is
 * gone — percentages resolve against the viewport once `position` is fixed.
 *
 * Below rather than above deliberately: over a grid of swatches, a tip floating
 * above its own swatch reads as belonging to the swatch above it.
 *
 * Presentational only: the owner decides when a tip is showing and supplies the
 * anchor rect. Only DominoColorPanel's swatches use it today; the truncated
 * labels and DDObject row names are the obvious next adopters.
 */
export default function FloatingTip({ anchor, children }: Props) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.top });

  // useLayoutEffect, not useEffect: this runs before paint, so the first-guess
  // position above never reaches the screen.
  useLayoutEffect(() => {
    const rect = tipRef.current?.getBoundingClientRect();
    if (!rect) return;

    const centered = anchor.left + anchor.width / 2 - rect.width / 2;
    const left = Math.max(
      MARGIN,
      Math.min(centered, window.innerWidth - rect.width - MARGIN),
    );
    const below = anchor.bottom + GAP;
    const top =
      below + rect.height > window.innerHeight - MARGIN ? anchor.top - rect.height - GAP : below;

    setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
  }, [anchor]);

  return (
    <div ref={tipRef} className={styles.tip} style={pos} role="tooltip">
      {children}
    </div>
  );
}