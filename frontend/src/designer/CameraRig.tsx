import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useShallow } from "zustand/shallow";
import type { OrthographicCamera, Vector3 } from "three";

import { useStore } from "../store";
import { getDDObjectBounds } from "../object-types/registry";
import type { DDObjectBounds } from "../object-types/base";
import type { CameraApi } from "../types";

// Minimal shape of the OrbitControls instance we rely on (avoids a hard
// dependency on three-stdlib's exported types).
interface OrbitLike {
  target: Vector3;
  minZoom: number;
  update: () => void;
}

// Fraction of the viewport a framed DDObject fills, leaving breathing room so
// its boundary rectangle isn't flush with the canvas edge. Deliberately only
// frameDDObject's: the initial build-plane fit and resetZoom stay edge-to-edge,
// which is what keeps controls.minZoom a true "can't zoom out past the plane"
// floor rather than a slightly-looser one.
const FRAME_FILL = 0.92;

/**
 * Lives inside the <Canvas>. It is the single point where React UI outside the
 * WebGL canvas reaches the three.js camera, registering an imperative
 * `cameraApi` into the store.
 */
export default function CameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as OrbitLike | null;
  const invalidate = useThree((s) => s.invalidate);

  const setCameraApi = useStore((s) => s.setCameraApi);
  // The camera fits whatever footprint the root DDObject declares, rather than
  // assuming a BuildPlane. Shallow-compared so the stable-reference property of
  // the old two-scalar subscription survives: renaming or recoloring the plane
  // mints a new root DDObject but shallow-equal bounds, so this effect doesn't
  // re-run and fight the user's zoom.
  const bounds = useStore(
    useShallow((s) => getDDObjectBounds(s.ddObjects[s.rootId])),
  );
  // Only for the diagnostic below; the fit itself never reads the type.
  const rootType = useStore((s) => s.ddObjects[s.rootId].type);

  const didInit = useRef(false);
  const warnedNoBounds = useRef(false);

  useEffect(() => {
    if (!controls) return;

    // A root whose type declares no bounds() can't be framed. Stay usable —
    // leave the camera at its defaults — and say so once (not per resize).
    if (!bounds) {
      if (!warnedNoBounds.current) {
        warnedNoBounds.current = true;
        console.warn(
          `Root DDObject type "${rootType}" declares no bounds(); the camera ` +
            `cannot fit the build area.`,
        );
      }
      return;
    }

    const applyZoom = (zoom: number) => {
      camera.zoom = Math.max(controls.minZoom, zoom);
      camera.updateProjectionMatrix();
      controls.update();
      invalidate();
    };

    const fitZoom = (b: DDObjectBounds, fill = 1) =>
      Math.min(size.width / b.width, size.height / b.height) * fill;

    const fitTo = (b: DDObjectBounds, fill = 1) => {
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      camera.position.set(cx, cy, camera.position.z || 100);
      controls.target.set(cx, cy, 0);
      applyZoom(fitZoom(b, fill));
    };

    const api: CameraApi = {
      zoomBy: (factor) => applyZoom(camera.zoom * factor),
      zoomTo: (zoom) => applyZoom(zoom),
      resetZoom: () => fitTo(bounds),
      frameDDObject: (id) => {
        const ddObject = useStore.getState().ddObjects[id];
        const b = ddObject && getDDObjectBounds(ddObject);
        if (b) fitTo(b, FRAME_FILL); // types that declare no bounds() are a no-op
      },
    };

    setCameraApi(api);

    // Never allow zooming out further than the bounds filling their
    // constrained axis (viewport or plane resizes move this floor too).
    controls.minZoom = fitZoom(bounds);
    if (camera.zoom < controls.minZoom) {
      applyZoom(controls.minZoom);
    }

    // Fit the plane to the view once, as soon as the canvas has a real size.
    if (!didInit.current && size.width > 0 && size.height > 0) {
      didInit.current = true;
      fitTo(bounds);
    }

    return () => {
      setCameraApi(null);
    };
  }, [controls, camera, size, bounds, rootType, invalidate, setCameraApi]);

  return null;
}
