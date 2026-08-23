import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import type { OrthographicCamera, Vector3 } from "three";

import {
  STRUCTURE_PLANE_HEIGHT_MM,
  STRUCTURE_PLANE_WIDTH_MM,
} from "./constants";
import { useStructureStore, type StructureCameraApi } from "./store";

/**
 * The bits of the OrbitControls instance this file uses. Written out rather
 * than imported so there is no hard dependency on three-stdlib's own types.
 */
interface OrbitLike {
  target: Vector3;
  minZoom: number;
  update: () => void;
}

/**
 * How far the camera sits from the point it is looking at. With an orthographic
 * camera this does not affect how big anything looks — that is the zoom — it
 * only decides how much room there is in front of and behind the scene, and it
 * is the radius the camera swings around on when the view is rotated.
 *
 * It has to clear the tallest stack the layer controls can *describe*, which is
 * not the same as the tallest structure anyone would build: a layer definition
 * repeating forever at a standing domino's full length reaches a little under
 * five metres. Nothing that tall is buildable, but it can be drawn, and with an
 * orthographic camera anything beyond this distance falls outside the near plane
 * and is cut away — so the top of such a preview would simply not be there. If a
 * layer limit or a layer height ever grows, this is the number that has to grow
 * with it.
 */
export const EYE_DISTANCE_MM = 5000;

/**
 * How far the view may be zoomed out, as a fraction of the zoom that fits the
 * build plane exactly — so the plane can be shrunk to about a fifth of the
 * canvas, but no further, and the build can never be lost as a speck.
 */
const MIN_ZOOM_FILL = 0.2;

/**
 * Lives inside the <Canvas>. It is the single place where UI outside the WebGL
 * canvas — the toolbar's zoom buttons — reaches the three.js camera, which it
 * does through an object of functions published into this screen's store.
 */
export default function StructureCameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  // The canvas only redraws when something asks it to (the <Canvas> is set to
  // frameloop="demand"), so any change made outside the draw loop has to say so.
  const invalidate = useThree((s) => s.invalidate);

  const setCameraApi = useStructureStore((s) => s.setCameraApi);
  const setSavedView = useStructureStore((s) => s.setSavedView);

  const didInit = useRef(false);

  useEffect(() => {
    if (!controls) return;

    // OrbitControls swings the camera around whichever axis the camera calls
    // "up", and three.js defaults that to +Y. This app's world is Z-up: the
    // build plane lies in X/Y and structures grow into +Z. Left at the default,
    // dragging up and down would roll the scene sideways instead of tipping it
    // away from straight-down. With up set to +Z, straight-down is the top of
    // the arc the camera travels on, a vertical drag tips towards the horizon,
    // and the controls' maxPolarAngle limit means what it reads as.
    camera.up.set(0, 0, 1);

    const centerX = STRUCTURE_PLANE_WIDTH_MM / 2;
    const centerY = STRUCTURE_PLANE_HEIGHT_MM / 2;

    const applyZoom = (zoom: number) => {
      camera.zoom = Math.max(controls.minZoom, zoom);
      camera.updateProjectionMatrix();
      controls.update();
      invalidate();
    };

    // The zoom at which the build plane exactly fills the canvas on its tighter
    // axis. Only meaningful looking straight down, which is the only time it is
    // asked for.
    const planeFitZoom = () =>
      Math.min(
        size.width / STRUCTURE_PLANE_WIDTH_MM,
        size.height / STRUCTURE_PLANE_HEIGHT_MM,
      );

    // Put the camera straight above the middle of the plane and fit the plane
    // to the canvas. Both callers want exactly this — the first look at the
    // screen, and the toolbar's fit button — so it never has to preserve an
    // angle the view had been rotated to. That is the point of the fit button:
    // it is the way back to looking straight down.
    const resetView = () => {
      camera.position.set(centerX, centerY, EYE_DISTANCE_MM);
      controls.target.set(centerX, centerY, 0);
      applyZoom(planeFitZoom());
    };

    const api: StructureCameraApi = {
      zoomBy: (factor) => applyZoom(camera.zoom * factor),
      zoomTo: (zoom) => applyZoom(zoom),
      resetView,
    };
    setCameraApi(api);

    // Recomputed on every resize, so the floor tracks the canvas.
    controls.minZoom = planeFitZoom() * MIN_ZOOM_FILL;
    if (camera.zoom < controls.minZoom) applyZoom(controls.minZoom);

    // First look at the screen, once the canvas has a real size to fit to.
    // Coming back to the screen restores the view it was left at instead:
    // re-establishing a rotation by hand is real work, and losing it on every
    // trip to another screen would make the two screens awkward to use
    // together.
    if (!didInit.current && size.width > 0 && size.height > 0) {
      didInit.current = true;
      const saved = useStructureStore.getState().savedView;
      if (saved) {
        camera.position.set(...saved.position);
        controls.target.set(...saved.target);
        applyZoom(saved.zoom);
      } else {
        resetView();
      }
    }

    return () => {
      // The camera and controls are still live here, so this is where the pose
      // can be read off them. This also runs on a resize, which simply rewrites
      // the same pose — harmless, and it keeps the saved view current.
      setSavedView({
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        zoom: camera.zoom,
      });
      setCameraApi(null);
    };
  }, [controls, camera, size, invalidate, setCameraApi, setSavedView]);

  return null;
}