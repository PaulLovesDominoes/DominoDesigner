import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

import { DOMINO_SIZE, type Position } from "../dimensions";
import type { DDObjectId } from "../object-types/base";
import { useDominoDataStore } from "./store";
import { useDominoSelectionStore } from "./selectionStore";
import { useColorLookupStore } from "../domino-inventory/colorLookupStore";
import {
  DEFAULT_DOMINO_COLOR,
  isHiddenColorId,
  withoutHiddenColorId,
} from "./object-model";
import { resolveDominoExpansion } from "./expansion";
import { useStore } from "../store";

/**
 * The shared drawing half of the domino system. Every element type that owns
 * dominoes (fields today; walls, towers, lines later) writes its dominoes into
 * the dominoes store, then renders this — so the actual meshes live in one place
 * and a new element type never re-implements drawing. The parent decides *where*
 * the dominoes go (positions/orientations in the store); this decides *how* they
 * are drawn.
 *
 * Two objects share one set of per-domino transforms: a filled InstancedMesh
 * (one geometry/material/draw call, per-domino color) and an edge outline.
 * The outline can't be an InstancedMesh — InstancedMesh renders triangles, not
 * lines — so it is an instanced LineSegments: one base EdgesGeometry with
 * per-instance aOffset/aScale attributes placed by a patched line material. That
 * keeps it to one draw call and no per-object allocation, the same budget as the
 * filled mesh.
 *
 * Both are drawn at the size dominoes/expansion.ts reports, which is DOMINO_SIZE
 * except while domino editing mode's Expand toggle is on. Growth is per-instance
 * (a scale in the matrix, a vec3 in aScale) precisely so neither geometry has to
 * be rebuilt — that would remount the InstancedMesh on every toggle.
 */

// How far toward the camera a *selected* domino's outline sits (mm). Every
// outline in a field is one instanced draw call, so two dominoes sharing an edge
// — which is every pair once they touch, whether expanded or at zero spacing —
// tie the depth test there and the higher instance index wins. Layout is
// row-major, so without this the neighbours above and to the right overdraw a
// selected domino's white edges and the selection reads as an L rather than a
// box. Small enough to be invisible against a domino's own length, large enough
// to clear depth-buffer quantization at any plane size this app allows.
const SELECTED_OUTLINE_Z_BIAS = 0.5;

// One domino's outline: the 12 box edges as line segments, centred on the
// origin, axes matching the filled box below. Built once — DOMINO_SIZE is a
// global constant; each field clones only its tiny position attribute.
const dominoEdges = new THREE.EdgesGeometry(
  new THREE.BoxGeometry(DOMINO_SIZE.thickness, DOMINO_SIZE.width, DOMINO_SIZE.length),
);

// The two outline colors, held as THREE.Color so the hex is converted from sRGB
// into three's linear working space exactly once, at module load. That
// conversion is required, not cosmetic: the shader patch below assigns
// vOutlineColor straight into diffuseColor, which is already in the working
// space, so a raw hex/255 would be gamma-brightened a second time by the
// renderer's output conversion and come out visibly lighter than asked for —
// the same trap the fill's setRGB(..., SRGBColorSpace) call documents. Pure
// black and pure white are invariant under it, which is why this only became
// load-bearing once the unselected outline stopped being black.
const OUTLINE_COLOR = new THREE.Color().setHex(0x606060, THREE.SRGBColorSpace);
const SELECTED_OUTLINE_COLOR = new THREE.Color().setHex(0xffffff, THREE.SRGBColorSpace);

// A single line material shared by every field's outline, patched to place each
// instance from its aOffset/aScale attributes (three has no instanced-line
// transform of its own) and to color it per-instance via aOutlineColor —
// domino editing mode outlines a selected domino in SELECTED_OUTLINE_COLOR,
// everything else stays OUTLINE_COLOR (see DominoModeller's copy effect).
// Stateless, so sharing across every field in the app is safe: the
// color/offset/scale all come from per-instance attributes on each field's own
// geometry, never from a uniform on this shared material.
//
// Deliberately constructed with no `color`: the fragment patch overwrites
// diffuseColor after <color_fragment> has computed it, so the material's own
// color is discarded and setting it here changes nothing. Change the two
// constants above instead.
const outlineMaterial = new THREE.LineBasicMaterial();
outlineMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute vec3 aOffset;\nattribute vec3 aScale;\nattribute vec3 aOutlineColor;\nvarying vec3 vOutlineColor;",
    )
    // Replaces the stock `vec3 transformed = vec3( position );`.
    .replace(
      "#include <begin_vertex>",
      "vec3 transformed = position * aScale + aOffset;\nvOutlineColor = aOutlineColor;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vOutlineColor;")
    .replace(
      "#include <color_fragment>",
      "#include <color_fragment>\ndiffuseColor.rgb = vOutlineColor;",
    );
};

// The filled box's material, likewise shared by every field, patched to throw
// away a hidden domino's pixels — `discard` writes no color and no depth, so the
// domino is simply not there on screen.
//
// Deliberately a discard rather than either obvious alternative, and the reason
// is clicking rather than looks:
//
//   - three's Raycaster is plain JavaScript on the CPU. It loops the
//     InstancedMesh's instances, reads each instanceMatrix, and does
//     ray-versus-triangle maths against this geometry's vertex positions. It
//     never asks the GPU anything and has no idea a shader exists — so a
//     discarded domino is still fully hittable by DominoEditTool's
//     hitDominoIndex, which is what lets an invisible domino be clicked and
//     unhidden.
//   - Collapsing a hidden domino's *matrix* to zero scale would be simpler and
//     would break exactly that, the matrix being CPU data the raycaster reads.
//     Worse, rubber-band selection reads `positions` directly and would keep
//     working — so drag-select would find dominoes that clicking could not.
//   - transparent + alpha 0 would look identical to this but costs alpha
//     blending and render-order sorting for nothing, visibility here being
//     all-or-nothing. That is the route a partly see-through ghost would need.
//
// polygonOffset pushes the fill away from the camera so the outline wins every
// depth tie against it — see the outline's own note about coincident edges.
const dominoFillMaterial = new THREE.MeshBasicMaterial({
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});
dominoFillMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nattribute float aVisible;\nvarying float vVisible;",
    )
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvVisible = aVisible;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\nvarying float vVisible;")
    // Earliest hook in the fragment shader, so a hidden domino costs nothing
    // beyond the interpolation that got us here.
    .replace(
      "#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\nif (vVisible < 0.5) discard;",
    );
};

// Reused across the copy loop so a field of 10,000 dominoes allocates nothing.
// Safe to share between modellers: the loop below is synchronous.
const scratchMatrix = new THREE.Matrix4();
const scratchColor = new THREE.Color();
// Written into aScale for a hidden, unselected domino — a zero vector shrinks
// its outline segments to zero length, i.e. draws nothing.
const NO_OUTLINE_SCALE = { x: 0, y: 0, z: 0 };

/**
 * An instanced copy of the domino outline sized for `capacity` dominoes. Clones
 * the base edge positions (cheap; avoids sharing a GPU buffer that one field's
 * dispose would free out from under another) and owns its own per-instance
 * aOffset (vec3) / aScale (vec3) buffers, written each version by the copy
 * effect. instanceCount is fixed at construction, hence the caller keys on it.
 *
 * aScale is a vec3 rather than a single float because expansion is per side
 * (object-types/base.ts's DominoExpansion), so a type can grow its dominoes by
 * different amounts on different axes. A zero vector collapses an instance's
 * segments to nothing, which is the mechanism to reach for if per-domino
 * invisibility is ever needed again.
 */
function buildOutlineGeometry(capacity: number) {
  const g = new THREE.InstancedBufferGeometry();
  g.instanceCount = capacity;
  g.setAttribute("position", dominoEdges.getAttribute("position").clone());
  g.setAttribute("aOffset", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  g.setAttribute("aScale", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  // Left zero-initialized: the copy effect writes an outline color for every
  // instance below d.count, and instanceCount keeps the rest from being drawn.
  g.setAttribute(
    "aOutlineColor",
    new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
  );
  return g;
}

/**
 * The filled box, plus the one per-domino attribute dominoFillMaterial's shader
 * patch reads. This exists as a built geometry rather than an inline
 * <boxGeometry> only because an InstancedBufferAttribute has to be attached to
 * it; the box itself is the same DOMINO_SIZE box as always. Keyed and disposed
 * on capacity like the outline geometry.
 */
function buildFillGeometry(capacity: number) {
  const g = new THREE.BoxGeometry(
    DOMINO_SIZE.thickness,
    DOMINO_SIZE.width,
    DOMINO_SIZE.length,
  );
  g.setAttribute("aVisible", new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
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
  // Selection changes independently of DominoData itself (domino editing mode's
  // click/drag/arrow-key gestures never touch positions/colors/hidden), so this
  // needs its own version subscription to trigger the copy effect below.
  const selectionVersion = useDominoSelectionStore((s) => s.versions[ddObjectId]);
  // Resolves a domino's colorId to actual RGB; changes reference whenever the
  // inventory does (colorLookupStore.ts), so editing or deleting an
  // inventory color redraws every domino painted with it.
  const rgbById = useColorLookupStore((s) => s.rgbById);
  // The three inputs resolveDominoExpansion reads. Subscribed individually
  // (primitives and the store's own DDObject reference) rather than calling the
  // resolver in a selector, which would return a fresh object every render — the
  // useShallow trap, see that function's doc.
  const dominoExpanded = useStore((s) => s.dominoExpanded);
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const ddObject = useStore((s) => s.ddObjects[ddObjectId]);

  const capacity = data?.capacity ?? 0;

  const outlineGeometry = useMemo(() => buildOutlineGeometry(capacity), [capacity]);
  useEffect(() => () => outlineGeometry.dispose(), [outlineGeometry]);

  const fillGeometry = useMemo(() => buildFillGeometry(capacity), [capacity]);
  useEffect(() => () => fillGeometry.dispose(), [fillGeometry]);

  // Copy the SoA columns into the filled mesh's instance buffers and the
  // outline's per-instance attributes. Neither reads DominoData at draw time:
  // the InstancedMesh owns instanceMatrix/instanceColor and the outline owns
  // aOffset/aScale, so every change is written across here. The outline's
  // placement attributes come only from positions and the current expansion — a
  // color edit never touches them.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const d = useDominoDataStore.getState().get(ddObjectId);
    if (!d) return;
    const selection = useDominoSelectionStore.getState().get(ddObjectId);

    const aOffset = outlineGeometry.getAttribute("aOffset") as THREE.InstancedBufferAttribute;
    const aScale = outlineGeometry.getAttribute("aScale") as THREE.InstancedBufferAttribute;
    const aOutlineColor = outlineGeometry.getAttribute(
      "aOutlineColor",
    ) as THREE.InstancedBufferAttribute;
    const aVisible = fillGeometry.getAttribute("aVisible") as THREE.InstancedBufferAttribute;

    // Uniform across the whole element, so resolved once rather than per domino.
    const e = resolveDominoExpansion(ddObjectId);
    const sx = (DOMINO_SIZE.thickness + e.x0 + e.x1) / DOMINO_SIZE.thickness;
    const sy = (DOMINO_SIZE.width + e.y0 + e.y1) / DOMINO_SIZE.width;
    const sz = (DOMINO_SIZE.length + e.z0 + e.z1) / DOMINO_SIZE.length;
    // Both geometries are centred on their origin, so growing by different
    // amounts on opposite faces is a scale plus a shift of the centre.
    const shiftX = (e.x1 - e.x0) / 2;
    const shiftY = (e.y1 - e.y0) / 2;

    for (let i = 0; i < d.count; i++) {
      const x = d.positions[3 * i] + shiftX;
      const y = d.positions[3 * i + 1] + shiftY;
      // STANDING this version, so no rotation — just lift the centre so the base
      // sits on the build plane at z = 0. Half the *grown* length, less whatever
      // the element grew downward, or an expanded domino sinks through the plane.
      const z = d.positions[3 * i + 2] + (DOMINO_SIZE.length + e.z1 - e.z0) / 2;

      const isSelected = selection?.selected.has(i) ?? false;
      const colorId = d.colorIds[i];
      const isHidden = isHiddenColorId(colorId);

      // makeScale/makeTranslation each reset the matrix, so this can't be two
      // make* calls — the scale has to be built first and then positioned. Note
      // the matrix is written at full size even when hidden: it's what the
      // raycaster reads, so collapsing it would make the domino unclickable
      // (see dominoFillMaterial).
      scratchMatrix.makeScale(sx, sy, sz).setPosition(x, y, z);
      mesh.setMatrixAt(i, scratchMatrix);
      aVisible.setX(i, isHidden ? 0 : 1);

      // A hidden domino keeps its outline only while selected — that white box
      // over nothing is the sole way to see what you're about to unhide.
      const outlineScale = isHidden && !isSelected ? NO_OUTLINE_SCALE : { x: sx, y: sy, z: sz };
      aScale.setXYZ(i, outlineScale.x, outlineScale.y, outlineScale.z);
      // The outline alone takes the selection bias; the fill stays put, so a
      // selected domino is never drawn at a different height than its neighbours.
      aOffset.setXYZ(i, x, y, isSelected ? z + SELECTED_OUTLINE_Z_BIAS : z);
      // colorIds[i] is a live reference into the inventory (0 = unpainted);
      // rgbById[...] is undefined for both the sentinel and a since-deleted
      // entry, so both cases share the same DEFAULT_DOMINO_COLOR fallback.
      // Masking the hidden flag off is not strictly needed while hidden dominoes
      // are discarded outright — this color is never sampled — but it keeps
      // instanceColor correct by construction if they ever become a translucent
      // ghost instead. Not dead code.
      const rgb = rgbById[withoutHiddenColorId(colorId)] ?? DEFAULT_DOMINO_COLOR;
      // rgbById's bytes are sRGB (parsed straight from "#rrggbb" — see
      // color.ts), but Color.setRGB's default colorSpace is three's linear
      // working space, not sRGB. Passing SRGBColorSpace explicitly is what
      // makes setColorAt's output match the same hex rendered as CSS (e.g.
      // the inventory swatches) — omitting it silently treats the sRGB
      // bytes as already-linear, so the renderer's linear-to-sRGB output
      // conversion gamma-brightens them a second time (dark colors wash out
      // hardest, since sRGB encoding lifts near-zero values the most).
      scratchColor.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
      mesh.setColorAt(i, scratchColor);

      const outline = isSelected ? SELECTED_OUTLINE_COLOR : OUTLINE_COLOR;
      aOutlineColor.setXYZ(i, outline.r, outline.g, outline.b);
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
    aOutlineColor.needsUpdate = true;
    aVisible.needsUpdate = true;
    outlineGeometry.instanceCount = d.count;

    invalidate(); // frameloop="demand"
  }, [
    ddObjectId,
    version,
    selectionVersion,
    rgbById,
    invalidate,
    outlineGeometry,
    fillGeometry,
    // Not read directly — they're what resolveDominoExpansion above reads, so
    // without them the Expand toggle would change nothing until something else
    // happened to bump one of the versions.
    dominoExpanded,
    dominoEditingId,
    ddObject,
  ]);

  if (capacity === 0) return null;

  return (
    <group position={[position.x, position.y, 0]}>
      {/* An InstancedMesh's count is fixed at construction, so a resized field
          needs a fresh one — hence keying on capacity. */}
      <instancedMesh
        key={`fill-${capacity}`}
        ref={meshRef}
        args={[undefined, undefined, capacity]}
        // Lets DominoEditTool identify which field an intersected instance
        // belongs to via e.intersections (its raycast hits the whole scene).
        userData={{ ddObjectId }}
        geometry={fillGeometry}
        material={dominoFillMaterial}
      />
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