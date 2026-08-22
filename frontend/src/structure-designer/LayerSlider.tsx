import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { MAX_LAYER, MIN_LAYER } from "./constants";
import { useStructureStore } from "./store";
import styles from "./LayerSlider.module.css";

/** Half the dot's height, matching .line's top/bottom inset in the CSS. */
const DOT_RADIUS_PX = 11;

/** How many layers PageUp and PageDown move. */
const PAGE_STEP = 10;

/**
 * Chooses the layer being worked on: a line down the middle of its own column
 * with a dot on it, dragged up for higher layers. The layer number reads above
 * it. The same idea as the layer scrubber in 3D-printer slicing software.
 *
 * It sits in a column of its own to the right of the canvas rather than
 * floating over it, so it never covers the view and the canvas keeps its whole
 * area for the tools this screen will grow.
 */
export default function LayerSlider() {
  const layer = useStructureStore((s) => s.layer);
  const setLayer = useStructureStore((s) => s.setLayer);
  const trackRef = useRef<HTMLDivElement>(null);

  // Where along the track a given layer sits, as a fraction from the bottom.
  const fractionFromBottom = (layer - MIN_LAYER) / (MAX_LAYER - MIN_LAYER);

  // Turn a pointer's y into a layer. The usable part of the track is inset by
  // the dot's radius at each end (see .line in the CSS), so the dot's centre
  // can reach the very first and very last layer without hanging off the
  // column. Layers count upward on screen but y grows downward, hence the
  // subtraction. setLayer clamps, so this does not have to.
  const layerAtClientY = (clientY: number): number => {
    const track = trackRef.current;
    if (!track) return layer;
    const rect = track.getBoundingClientRect();
    const usable = rect.height - DOT_RADIUS_PX * 2;
    if (usable <= 0) return layer;
    const fromBottom = rect.bottom - DOT_RADIUS_PX - clientY;
    return MIN_LAYER + (fromBottom / usable) * (MAX_LAYER - MIN_LAYER);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Stop the browser doing what it normally would with a press-and-drag,
    // which is to start selecting text or to start a drag-and-drop. Either one
    // makes the browser take the pointer away from us: it sends a
    // "pointercancel", the capture below is dropped, the moves stop arriving,
    // and the cursor turns into the red no-drop circle mid-drag.
    e.preventDefault();
    // Capturing the pointer sends every later move and the release to this
    // element even once the pointer has left it, so a drag that wanders out
    // over the canvas keeps working and cannot be lost.
    e.currentTarget.setPointerCapture(e.pointerId);
    setLayer(layerAtClientY(e.clientY));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    setLayer(layerAtClientY(e.clientY));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step =
      e.key === "ArrowUp" ? 1
      : e.key === "ArrowDown" ? -1
      : e.key === "PageUp" ? PAGE_STEP
      : e.key === "PageDown" ? -PAGE_STEP
      : 0;

    if (step !== 0) {
      e.preventDefault();
      setLayer(layer + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      setLayer(MIN_LAYER);
    } else if (e.key === "End") {
      e.preventDefault();
      setLayer(MAX_LAYER);
    }
  };

  return (
    <div className={styles.column}>
      <div className={styles.readout}>
        <span className={styles.caption}>Layer</span>
        <span className={styles.value}>{layer}</span>
      </div>

      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label="Layer"
        aria-valuemin={MIN_LAYER}
        aria-valuemax={MAX_LAYER}
        aria-valuenow={layer}
        aria-valuetext={`Layer ${layer}`}
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onKeyDown={onKeyDown}
      >
        <div className={styles.line} />
        <div
          className={styles.dot}
          style={{ top: `calc(${(1 - fractionFromBottom) * 100}% + ${
            (fractionFromBottom * 2 - 1) * DOT_RADIUS_PX
          }px)` }}
        />
      </div>
    </div>
  );
}