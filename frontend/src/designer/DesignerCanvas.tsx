import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import Scene from "./Scene";
import CameraRig from "./CameraRig";
import CreateByRegionTool from "./CreateByRegionTool";
import SelectionTool from "./SelectionTool";
import DominoEditTool from "./DominoEditTool";
import { useStore } from "../store";

/**
 * The 2D designer canvas. Orthographic top-down view, 1 three.js unit = 1 mm.
 * Controls: mouse wheel zooms, right-drag pans (left button is reserved for
 * tools; rotation is disabled for a flat 2D feel).
 */
export default function DesignerCanvas() {
  return (
    <Canvas
      orthographic
      frameloop="demand"
      camera={{ position: [0, 0, 100], near: 0.1, far: 2000, zoom: 0.4 }}
      style={{ position: "absolute", inset: 0 }}
      // A left-click that hits no mesh at all (the dark area outside the build
      // plane) deselects, mirroring a click on the plane's empty surface. Read
      // imperatively so it doesn't re-render the canvas; gated to the select
      // tool with no dialog open, matching SelectionTool's own guard.
      onPointerMissed={(e) => {
        if (e.button !== 0) return;
        const s = useStore.getState();
        if (s.activeTool === "select" && s.editingDDObjectId === null) {
          s.selectDDObject(null);
        }
      }}
    >
      <color attach="background" args={["#14161a"]} />

      <Scene />

      <CreateByRegionTool />
      <SelectionTool />
      <DominoEditTool />

      <OrbitControls
        makeDefault
        enableRotate={false}
        enableDamping={false}
        screenSpacePanning
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />

      <CameraRig />
    </Canvas>
  );
}
