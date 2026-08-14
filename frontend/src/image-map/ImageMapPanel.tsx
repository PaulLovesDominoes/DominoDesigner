import { useState } from "react";
import {
  RiBringToFront,
  RiCursorLine,
  RiEraserLine,
  RiEyeLine,
  RiEyeOffLine,
  RiImageAddLine,
  RiMagicLine,
  RiSendToBack,
} from "@remixicon/react";

import { useStore } from "../store";
import { getDDObjectBounds } from "../object-types/registry";
import ConfirmDialog from "../components/ConfirmDialog";
import { COLOR_DISTANCE_LIST, type ColorDistanceId } from "../color-distance/registry";
import { DITHER_LIST, type DitherId } from "../dither/registry";
import { PATCH_SAMPLE_LIST, type PatchSampleId } from "./patch-sample/registry";
import { pickAndLoadImage } from "./assetStore";
import { coverPlacement, imageOriginFor } from "./object-model";
import styles from "./ImageMapPanel.module.css";

/**
 * The sidebar panel for image mapping mode, sitting above the colour swatches.
 *
 * It lives in image-map/ with the rest of the feature rather than in designer/,
 * which is where the older panels happen to sit — the feature owns its own UI,
 * the way dominoes/ owns its modeller.
 */

const GLYPH_PX = 18;

/** A newly loaded picture starts fully opaque. */
const INITIAL_OPACITY = 1;

export default function ImageMapPanel() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const imageMapActive = useStore((s) => s.imageMapActive);
  const imageMapSelected = useStore((s) => s.imageMapSelected);
  const image = useStore((s) => (s.dominoEditingId ? s.imageMaps[s.dominoEditingId] : undefined));
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));
  const colorDistanceId = useStore((s) => s.colorDistanceId);
  const patchSampleId = useStore((s) => s.patchSampleId);
  const ditherId = useStore((s) => s.ditherId);
  const ditherStrength = useStore((s) => s.ditherStrength);
  const colorMappingProgress = useStore((s) => s.colorMappingProgress);
  const imageMapMessage = useStore((s) => s.imageMapMessage);
  const targetCount = useStore((s) =>
    s.dominoEditingId ? (s.imageMapTargets[s.dominoEditingId]?.length ?? 0) : 0,
  );

  const setImageMapSelected = useStore((s) => s.setImageMapSelected);
  const setImageMap = useStore((s) => s.setImageMap);
  const updateImageMap = useStore((s) => s.updateImageMap);
  const setColorDistance = useStore((s) => s.setColorDistance);
  const setPatchSample = useStore((s) => s.setPatchSample);
  const setDither = useStore((s) => s.setDither);
  const setDitherStrength = useStore((s) => s.setDitherStrength);
  const setImageMapMessage = useStore((s) => s.setImageMapMessage);
  const startColorMapping = useStore((s) => s.startColorMapping);
  const cancelColorMapping = useStore((s) => s.cancelColorMapping);
  const clearMappedColors = useStore((s) => s.clearMappedColors);

  // Asked before a New Image replaces one already loaded. Owned here, mounted
  // inline — ConfirmDialog is deliberately not store state.
  const [confirmingReplace, setConfirmingReplace] = useState(false);

  if (!dominoEditingId || !imageMapActive) return null;

  const mapping = colorMappingProgress !== null;

  /**
   * Every control here except Select puts the handles away first. Clicking
   * anything in the panel means the user has finished positioning, and leaving
   * the handles up over a picture nobody is dragging only invites a stray click
   * that moves it.
   */
  const deselectFirst = () => setImageMapSelected(false);

  const loadImage = () => {
    deselectFirst();
    setImageMapMessage(null);
    pickAndLoadImage(dominoEditingId)
      .then((loaded) => {
        if (!loaded) return;
        const bounds = ddObject && getDDObjectBounds(ddObject);
        const origin = ddObject && imageOriginFor(ddObject);
        if (!bounds || !origin) return;
        setImageMap(dominoEditingId, {
          ...loaded,
          ...coverPlacement(bounds, origin, loaded.naturalWidth, loaded.naturalHeight),
          opacity: INITIAL_OPACITY,
          visible: true,
          // Under the painted dominoes by default: the point of the mode is to
          // watch colours land against the picture, which needs them in front of
          // it.
          layer: "below",
        });
        setImageMapSelected(true);
      })
      .catch((error: Error) => setImageMapMessage(error.message));
  };

  const onNewImage = () => {
    if (image) setConfirmingReplace(true);
    else loadImage();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Image</div>

      <div className={styles.tools}>
        <button
          className={styles.iconBtn}
          onClick={onNewImage}
          title="New"
          aria-label="New Image"
        >
          <RiImageAddLine size={GLYPH_PX} />
        </button>
        <button
          className={
            imageMapSelected ? `${styles.iconBtn} ${styles.active}` : styles.iconBtn
          }
          onClick={() => setImageMapSelected(!imageMapSelected)}
          disabled={!image}
          aria-pressed={imageMapSelected}
          title="Selects the image for moving or resizing"
          aria-label="Selects the image for moving or resizing"
        >
          <RiCursorLine size={GLYPH_PX} />
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => {
            deselectFirst();
            updateImageMap(dominoEditingId, {
              layer: image?.layer === "above" ? "below" : "above",
            });
          }}
          disabled={!image}
          title={
            image?.layer === "above"
              ? "The image is above every domino. Click to put it behind the colored ones."
              : "The image is behind the colored dominoes. Click to put it above every domino."
          }
          aria-label={image?.layer === "above" ? "Image is above" : "Image is below"}
        >
          {image?.layer === "above" ? (
            <RiBringToFront size={GLYPH_PX} />
          ) : (
            <RiSendToBack size={GLYPH_PX} />
          )}
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => {
            deselectFirst();
            updateImageMap(dominoEditingId, { visible: !image?.visible });
          }}
          disabled={!image}
          aria-pressed={!image?.visible}
          title={image?.visible ? "Hide the image" : "Show the image"}
          aria-label={image?.visible ? "Hide the image" : "Show the image"}
        >
          {image?.visible ? <RiEyeLine size={GLYPH_PX} /> : <RiEyeOffLine size={GLYPH_PX} />}
        </button>
      </div>

      {image && <div className={styles.fileName}>{image.fileName}</div>}

      <div className={styles.row}>
        <div className={styles.rowLabel}>
          <span>Transparency</span>
          <span>{image ? `${Math.round((1 - image.opacity) * 100)}%` : "—"}</span>
        </div>
        {/* Expressed as transparency to match the label, so the slider reads
            left-to-right as more see-through; opacity is what gets stored. */}
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={image ? Math.round((1 - image.opacity) * 100) : 0}
          disabled={!image}
          onChange={(e) => {
            deselectFirst();
            updateImageMap(dominoEditingId, { opacity: 1 - Number(e.target.value) / 100 });
          }}
          aria-label="Image transparency"
        />
      </div>

      {/* Sampling comes first because it is about reading the picture, where the
          two below it are about choosing a color from what was read. */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>
          <span>Sampling</span>
        </div>
        <select
          className={styles.select}
          value={patchSampleId}
          onChange={(e) => {
            deselectFirst();
            setPatchSample(e.target.value as PatchSampleId);
          }}
          aria-label="How each domino's patch of the picture is read"
        >
          {PATCH_SAMPLE_LIST.map((patchSample) => (
            <option key={patchSample.id} value={patchSample.id}>
              {patchSample.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>
          <span>Color Distance</span>
        </div>
        {/* Driven off the registry, so a new metric needs no edit here. */}
        <select
          className={styles.select}
          value={colorDistanceId}
          onChange={(e) => {
            deselectFirst();
            setColorDistance(e.target.value as ColorDistanceId);
          }}
          aria-label="How to choose the nearest inventory color"
        >
          {COLOR_DISTANCE_LIST.map((metric) => (
            <option key={metric.id} value={metric.id}>
              {metric.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>
          <span>Dither</span>
        </div>
        {/* Driven off its own registry, so a new dither needs no edit here.
            Separate from Color Distance because the two are separate stages —
            see dither/base.ts. */}
        <select
          className={styles.select}
          value={ditherId}
          onChange={(e) => {
            deselectFirst();
            setDither(e.target.value as DitherId);
          }}
          aria-label="Pattern used to break up color banding"
        >
          {DITHER_LIST.map((dither) => (
            <option key={dither.id} value={dither.id}>
              {dither.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.row}>
        <div className={styles.rowLabel}>
          <span>Dither Strength</span>
          <span>{`${Math.round(ditherStrength * 100)}%`}</span>
        </div>
        {/* Nothing to set when no dither is chosen — at any strength it would
            still nudge nothing. Tested against "none" by name and deliberately
            not against DEFAULT_DITHER, which is only *currently* the same entry:
            change the default to a Bayer one and that version would grey the
            slider out on the very setting it belongs to. */}
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={Math.round(ditherStrength * 100)}
          disabled={ditherId === "none"}
          onChange={(e) => {
            deselectFirst();
            setDitherStrength(Number(e.target.value) / 100);
          }}
          aria-label="How strongly the dither is applied"
        />
      </div>

      <div className={styles.actions}>
        <button
          className={styles.mapBtn}
          onClick={() => {
            deselectFirst();
            startColorMapping();
          }}
          disabled={!image || mapping}
          title="Give each domino this mode may color the nearest inventory color to the image"
        >
          <RiMagicLine size={GLYPH_PX} />
          Map Colors
        </button>
        <button
          className={styles.clearBtn}
          onClick={() => {
            deselectFirst();
            clearMappedColors();
          }}
          disabled={mapping || targetCount === 0}
          title="Put every domino this mode may color back to unassigned"
        >
          <RiEraserLine size={GLYPH_PX} />
          Clear
        </button>
      </div>

      {mapping && (
        <div className={styles.progress}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: `${Math.round((colorMappingProgress ?? 0) * 100)}%` }}
            />
          </div>
          <button className={styles.textBtn} onClick={cancelColorMapping}>
            Cancel
          </button>
        </div>
      )}

      {imageMapMessage && <div className={styles.message}>{imageMapMessage}</div>}

      {confirmingReplace && (
        <ConfirmDialog
          message="This element already has an image. Loading a new one replaces it."
          confirmLabel="Choose a new image"
          cancelLabel="Keep the current image"
          onConfirm={() => {
            setConfirmingReplace(false);
            loadImage();
          }}
          onCancel={() => setConfirmingReplace(false)}
        />
      )}
    </div>
  );
}