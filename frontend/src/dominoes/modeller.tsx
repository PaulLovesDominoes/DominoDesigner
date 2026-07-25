import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { DOMINO_SIZE, type Position } from "../dimensions";
import type { DDObjectId } from "../object-types/base";
import { useDominoDataStore } from "./store";

/**
 * The shared drawing half of the domino system. Every element type that owns
 * dominoes (fields today; walls, towers, lines later) writes its dominoes into
 * the dominoes store, then renders this — so the actual meshes live in one place
 * and a new element type never re-implements drawing. The parent decides *where*
 * the dominoes go (positions/orientations in the store); this decides *how* they
 * are drawn.
 *
 * Two objects share one set of per-domino transforms: a filled InstancedMesh
 * (one geometry/material/draw call, per-domino color) and a black edge outline.
 * The outline can't be an InstancedMesh — InstancedMesh renders triangles, not
 * lines — so it is an instanced LineSegments: one base EdgesGeometry with
 * per-instance aOffset/aScale attributes placed by a patched line material. That
 * keeps it to one draw call and no per-object allocation, the same budget as the
 * filled mesh.
 */

// One domino's outline: the 12 box edges as line segments, centred on the
// origin, axes matching the filled box below. Built once — DOMINO_SIZE is a
// global constant; each field clones only its tiny position attribute.
const dominoEdges = new THREE.EdgesGeometry(
  new THREE.BoxGeometry(DOMINO_SIZE.thickness, DOMINO_SIZE.width, DOMINO_SIZE.length),
);

// A single black line material shared by every field's outline, patched to place
// each instance from its aOffset/aScale attributes in the vertex shader (three
// has no instanced-line transform of its own). Stateless, so sharing is safe.
const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
outlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec3 aOffset;\nattribute float aScale;",
    )
    // Replaces the stock `vec3 transformed = vec3( position );`.
    .replace("#include <begin_vertex>", "vec3 transformed = position * aScale + aOffset;");
};

// Reused across the copy loop so a field of 10,000 dominoes allocates nothing.
// Safe to share between modellers: the loop below is synchronous.
const scratchMatrix = new THREE.Matrix4();
const scratchColor = new THREE.Color();

/**
 * An instanced copy of the domino outline sized for `capacity` dominoes. Clones
 * the base edge positions (cheap; avoids sharing a GPU buffer that one field's
 * dispose would free out from under another) and owns its own per-instance
 * aOffset (vec3) / aScale (float) buffers, written each version by the copy
 * effect. instanceCount is fixed at construction, hence the caller keys on it.
 */
function buildOutlineGeometry(capacity: number) {
  const g = new THREE.InstancedBufferGeometry();
  g.instanceCount = capacity;
  g.setAttribute("position", dominoEdges.getAttribute("position").clone());
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute("aScale", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  return g;
}

/**
 * Draws the dominoes stored under `ddObjectId`, positioned at the parent
 * element's `position`. Subscribes to the store's version counter (the buffers
 * mutate in place, so the version — not the buffer reference — is the change
 * signal) and re-copies the columns across whenever it bumps.
 */
export function DominoModeller({
  ddObjectId,
  position,
}: {
  ddObjectId: DDObjectId;
  position: Position;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((s) => s.invalidate);

  const data = useDominoDataStore((s) => s.dominoes.get(ddObjectId));
  const version = useDominoDataStore((s) => s.versions[ddObjectId]);

  const capacity = data?.capacity ?? 0;

  const outlineGeometry = useMemo(() => buildOutlineGeometry(capacity), [capacity]);
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry]);

  // Copy the SoA columns into the filled mesh's instance buffers and the
  // outline's per-instance attributes. Neither reads DominoData at draw time:
  // the InstancedMesh owns instanceMatrix/instanceColor and the outline owns
  // aOffset/aScale, so every change is written across here. The outline's
  // attributes come only from positions/visibility — a color edit never touches
  // them.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const d = useDominoDataStore.getState().get(ddObjectId);
    if (!d) return;

    const aOffset = outlineGeometry.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    const aScale = outlineGeometry.getAttribute("aScale") as THREE.InstancedBufferAttribute;

    for (let i = 0; i < d.count; i++) {
      const x = d.positions[3 * i];
      const y = d.positions[3 * i + 1];
      // STANDING this version, so no rotation — just lift the centre by half the
      // length, since the box is centred on its origin and the base has to sit
      // on the build plane at z = 0.
      const z = d.positions[3 * i + 2] + DOMINO_SIZE.length / 2;

      if (d.hidden[i]) {
        // Collapse to nothing rather than compacting the buffer, so every domino
        // keeps its index for the life of the field. Outline: aScale 0 makes its
        // segments zero-length (drawn as nothing), the line analogue.
        scratchMatrix.makeScale(0, 0, 0);
        aScale.setX(i, 0);
      } else {
        scratchMatrix.makeTranslation(x, y, z);
        aScale.setX(i, 1);
        aOffset.setXYZ(i, x, y, z);
      }
      mesh.setMatrixAt(i, scratchMatrix);
      scratchColor.setRGB(
        d.colors[3 * i] / 255,
        d.colors[3 * i + 1] / 255,
        d.colors[3 * i + 2] / 255,
      );
      mesh.setColorAt(i, scratchColor);
    }

    mesh.count = d.count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // The box geometry's own bounds describe one domino at the origin, so without
    // this the whole field gets frustum-culled the moment that domino is
    // offscreen. InstancedMesh's version accounts for the instance matrices.
    mesh.computeBoundingSphere();

    aOffset.needsUpdate = true;
    aScale.needsUpdate = true;
    outlineGeometry.instanceCount = d.count;

    invalidate(); // frameloop="demand"
  }, [ddObjectId, version, invalidate, outlineGeometry]);

  if (capacity === 0) return null;

  return (
    <group position={[position.x, position.y, 0]}>
      {/* An InstancedMesh's count is fixed at construction, so a resized field
          needs a fresh one — hence keying on capacity. */}
      <instancedMesh key={`fill-${capacity}`} ref={meshRef} args={[undefined, undefined, capacity]}>
        <boxGeometry args={[DOMINO_SIZE.thickness, DOMINO_SIZE.width, DOMINO_SIZE.length]} />
        <meshBasicMaterial />
      </instancedMesh>
      {/* The instanced line geometry can't cheaply report a real bounding sphere
          (it's one domino at the origin plus per-instance offsets the CPU never
          sees), so opt it out of frustum culling rather than let it vanish. */}
      <lineSegments
        key={`outline-${capacity}`}
        geometry={outlineGeometry}
        material={outlineMaterial}
        frustumCulled={false}
      />
    </group>
  );
}