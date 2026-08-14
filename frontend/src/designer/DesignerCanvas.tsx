import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

import Scene from "./Scene";
import CameraRig from "./CameraRig";
import CreateByRegionTool from "./CreateByRegionTool";
import SelectionTool from "./SelectionTool";
import DominoEditor from "./DominoEditor";
import ImageMapModeller from "../image-map/modeller";
import ImageTransformTool from "../image-map/ImageTransformTool";
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
      // This scene is flat-shaded and unlit (no lights, meshBasicMaterial
      // everywhere) and colors must match their hex values exactly (e.g. the
      // inventory swatches), so R3F's default ACESFilmicToneMapping — meant
      // for physically-lit HDR scenes — is actively wrong here: its filmic
      // rolloff desaturates and shifts saturated colors like orange even
      // after the sRGB colorSpace fix in dominoes/modeller.tsx. `flat`
      // switches the renderer to NoToneMapping.
      flat
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
      {/* The picture goes under DominoEditor so the mode outline, which draws
          with depthTest off, still shows through an opaque one; the transform
          tool goes last of all, since its handles are the topmost thing on the
          canvas whenever it is armed. Like every tool here, all three arm
          themselves and return null otherwise. */}
      <ImageMapModeller />
      <DominoEditor />
      <ImageTransformTool />

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
