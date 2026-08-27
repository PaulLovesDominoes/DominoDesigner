import { useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import AllLayersView from "./AllLayersView";
import { MAX_POLAR_ANGLE } from "./constants";
import DominoPlacementTool from "./DominoPlacementTool";
import DominoSelectTool from "./DominoSelectTool";
import JunctionGrid from "./JunctionGrid";
import LayerPlane from "./LayerPlane";
import PlacedDominoes from "./PlacedDominoes";
import StructureBuildPlane from "./StructureBuildPlane";
import StructureCameraRig, { EYE_DISTANCE_MM } from "./StructureCameraRig";
import StructurePreview from "./StructurePreview";

/** The bit of the OrbitControls instance ShiftRotateGesture rewrites. */
interface MouseButtonControls {
  mouseButtons: { LEFT?: THREE.MOUSE; MIDDLE?: THREE.MOUSE; RIGHT?: THREE.MOUSE };
}

/**
 * Makes a right-drag pan, and a Shift+right-drag rotate.
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
 * The catch, and the reason this reads backwards: OrbitControls does its own
 * modifier handling on top of whatever it finds here. If ctrl, meta *or shift*
 * is held it swaps pan and rotate for each other — so setting ROTATE for a
 * Shift-drag got quietly turned back into a pan, and a plain PAN with Ctrl held
 * got turned into a rotate. That was a real bug: Ctrl rotated and Shift did not.
 *
 * So this sets the opposite of what it wants whenever any of those three keys
 * is down, letting the swap land on the right one. The result is that Shift is
 * the only key that rotates, and Ctrl or Cmd with the right button pans exactly
 * like the right button on its own.
 *
 * Deliberately not React state flipped by watching the Shift key, which would
 * re-render the canvas every time Shift was pressed or let go.
 */
function ShiftRotateGesture() {
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as MouseButtonControls | null;

  useEffect(() => {
    if (!controls) return;
    const element = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      const wantRotate = e.shiftKey;
      const orbitControlsWillSwap = e.ctrlKey || e.metaKey || e.shiftKey;
      const rotate = orbitControlsWillSwap ? !wantRotate : wantRotate;
      controls.mouseButtons.RIGHT = rotate ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    };
    element.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      element.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [gl, controls]);

  return null;
}

/**
 * The Structure Designer's canvas. Orthographic, so a millimetre is the same
 * length wherever it is on screen and nothing is foreshortened — one three.js
 * unit is one millimetre, as everywhere else in the app.
 *
 * Unlike the Designer's canvas the view can be rotated, which is the whole
 * point: tipping it away from straight-down is what makes the layer sheet, and
 * eventually the structure standing on it, readable as something with height.
 */
export default function StructureCanvas() {
  return (
    <Canvas
      orthographic
      // Only redraw when something changes, rather than continuously.
      frameloop="demand"
      // The scene is unlit and painted with flat colours, so R3F's default
      // film-style tone mapping — which exists to squeeze a realistically lit
      // scene into a screen's range — has nothing to do here but shift the
      // colours away from what was asked for. `flat` turns it off.
      flat
      // The same distance the camera rig puts the camera at, taken from there
      // rather than written out again — the two disagreeing would mean the first
      // frame was drawn from somewhere the rig then moved away from. Near and
      // far are well outside anything that can be built. See EYE_DISTANCE_MM.
      camera={{ position: [0, 0, EYE_DISTANCE_MM], near: 0.1, far: 20000, zoom: 0.4 }}
      style={{ position: "absolute", inset: 0 }}
    >
      <color attach="background" args={["#14161a"]} />

      <StructureBuildPlane />
      <AllLayersView />
      <LayerPlane />
      {/* After the layer sheet, so the dots are drawn over it rather than under. */}
      <JunctionGrid />
      {/* The structure itself. Drawn whatever else is going on, unlike the two
          above and the preview below — see PlacedDominoes.tsx. */}
      <PlacedDominoes />
      <StructurePreview />
      {/* Last, so the invisible surface either of these puts up for measuring
          the pointer against is not in the way of anything drawn. Exactly one of
          them arms itself at a time, off the chosen tool, so their two surfaces
          are never in the scene together. */}
      <DominoPlacementTool />
      <DominoSelectTool />

      <OrbitControls
        makeDefault
        enableRotate
        enableDamping={false}
        // Panning follows the screen rather than the ground, so a drag moves
        // what is under the pointer by the same amount at any tilt.
        screenSpacePanning
        // The camera may tip from straight-down to almost edge-on, but never
        // gets under the build plane.
        minPolarAngle={0}
        maxPolarAngle={MAX_POLAR_ANGLE}
        // Left is left free for the tools this screen will grow. Right starts
        // as pan and is rewritten per press by ShiftRotateGesture above.
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />

      <ShiftRotateGesture />
      <StructureCameraRig />
    </Canvas>
  );
}