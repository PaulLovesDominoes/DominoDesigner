import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

/** The bit of the OrbitControls instance this rewrites. */
interface MouseButtonControls {
  mouseButtons: { LEFT?: THREE.MOUSE; MIDDLE?: THREE.MOUSE; RIGHT?: THREE.MOUSE };
}

/**
 * Makes a right-drag pan, and — where the screen allows it — a Shift+right-drag
 * rotate. Shared by both canvases; drop it inside a `<Canvas>` alongside
 * `<OrbitControls makeDefault>`.
 *
 * OrbitControls looks up what the right button does once, when the button goes
 * down, and does that for the whole drag. So the way to get two gestures out of
 * one button is to set what it means immediately before OrbitControls reads it.
 *
 * "Capture phase" is what makes the ordering certain. A browser delivers an
 * event to the outermost element first and works inwards (capture), then back
 * out again (bubble); handlers registered with `capture: true` run on the way
 * in. OrbitControls listens the ordinary way, so this always runs first.
 *
 * ## Why it reads backwards
 *
 * OrbitControls does its own modifier handling on top of whatever it finds
 * here. If ctrl, meta *or shift* is held it swaps pan and rotate for each other
 * — so setting ROTATE for a Shift-drag got quietly turned back into a pan, and
 * a plain PAN with Ctrl held got turned into a rotate. That was a real bug:
 * Ctrl rotated and Shift did not.
 *
 * So this sets the opposite of what it wants whenever any of those three keys
 * is down, letting the swap land on the right one.
 *
 * ## Why a screen that cannot rotate still needs this
 *
 * Not merely to disable a gesture — without it, a modified right-drag does
 * nothing at all. `three-stdlib`'s OrbitControls (which is what drei uses, not
 * three's own copy) reads, in its mousedown handler:
 *
 * ```js
 * case MOUSE.PAN:
 *   if (event.ctrlKey || event.metaKey || event.shiftKey) {
 *     if (scope.enableRotate === false) return;   // ← bails out entirely
 * ```
 *
 * So on a canvas with `enableRotate={false}`, holding any of those three keys
 * and dragging with the right button lands on that `return` and the press is
 * simply dropped. Setting ROTATE instead takes the sibling branch, which routes
 * a modified drag to panning and is guarded only by `enablePan`.
 *
 * That mattered enough to find because of what a Mac trackpad can do:
 * **Ctrl plus a one-finger drag is a MacBook's only right-drag**, so on a
 * screen where right-drag is the sole pan gesture, panning was impossible there
 * without an external mouse.
 *
 * Deliberately not React state flipped by watching the Shift key, which would
 * re-render the canvas every time Shift was pressed or let go.
 */
export default function RightDragGesture({
  /**
   * Whether Shift+right-drag should rotate the view. False on a screen whose
   * OrbitControls has `enableRotate={false}` — a Shift+right-drag there is
   * simply another pan, which is the honest thing for a view that cannot turn.
   */
  shiftRotates,
}: {
  shiftRotates: boolean;
}) {
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as MouseButtonControls | null;

  useEffect(() => {
    if (!controls) return;
    const element = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      // Only the right button's meaning is being set, so a left press has no
      // business changing it. Without this guard a modified *left* drag — which
      // is how a Mac adds to a selection — would leave ROTATE behind it for
      // whatever right-drag came next.
      if (e.button !== 2) return;
      const wantRotate = shiftRotates && e.shiftKey;
      const orbitControlsWillSwap = e.ctrlKey || e.metaKey || e.shiftKey;
      const rotate = orbitControlsWillSwap ? !wantRotate : wantRotate;
      controls.mouseButtons.RIGHT = rotate ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    };
    element.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      element.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [gl, controls, shiftRotates]);

  return null;
}
