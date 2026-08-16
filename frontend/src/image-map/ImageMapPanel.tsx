import { useMemo, useState } from "react";
import { RiCloseLine, RiEraserLine, RiMagicLine } from "@remixicon/react";

import { useStore } from "../store";
import ConfirmDialog from "../components/ConfirmDialog";
import { COLOR_DISTANCE_LIST, type ColorDistanceId } from "../color-distance/registry";
import { DITHER_LIST, type DitherId } from "../dither/registry";
import { useDominoDataStore } from "../dominoes/store";
import { makeDominoUnderImageTest } from "./coverage";
import { imageMapPaletteEntries } from "./palette";
import { PATCH_SAMPLE_LIST, type PatchSampleId } from "./patch-sample/registry";
import styles from "./ImageMapPanel.module.css";

/**
 * The sidebar panel for image mapping mode, sitting above the colour swatches.
 *
 * It lives in image-map/ with the rest of the feature rather than in designer/,
 * which is where the older panels happen to sit — the feature owns its own UI,
 * the way dominoes/ owns its modeller.
 *
 * **It is about choosing colours, and nothing else.** Loading a picture, moving
 * it, hiding it, and setting its transparency and layer all used to live here
 * too, in a little toolbar across the top. They moved to the toolbar's image
 * menu when the picture stopped belonging to this mode — a picture is shown for
 * tracing as often as for mapping, and those controls have to be reachable
 * without opening this panel at all.
 */

const GLYPH_PX = 18;

/** What the (?) beside the count explains. */
const TARGETS_EXPLANATION =
  "Image colors are only mapped to unassigned dominoes. Dominoes that already " +
  "have a color are left untouched.";

/** Raised on entry when the picture has no unassigned dominoes under it at all. */
const ALL_COLORED_MESSAGE =
  "Every domino under this picture already has a color, so image mapping has " +
  "nothing to fill. Select some dominoes and clear them to unassigned first.";

/** Raised on entry when the picture isn't over the element at all. */
const NO_DOMINOES_MESSAGE =
  "This picture isn't over any dominoes, so image mapping has nothing to fill. " +
  "Use Resize and Move in the image menu to bring it over some dominoes.";

export default function ImageMapPanel() {
  const dominoEditingId = useStore((s) => s.dominoEditingId);
  const imageMapActive = useStore((s) => s.imageMapActive);
  const image = useStore((s) => (s.dominoEditingId ? s.imageMaps[s.dominoEditingId] : undefined));
  const ddObject = useStore((s) => (s.dominoEditingId ? s.ddObjects[s.dominoEditingId] : undefined));
  const colorDistanceId = useStore((s) => s.colorDistanceId);
  const patchSampleId = useStore((s) => s.patchSampleId);
  const ditherId = useStore((s) => s.ditherId);
  const ditherStrength = useStore((s) => s.ditherStrength);
  const colorMappingProgress = useStore((s) => s.colorMappingProgress);
  const imageMapMessage = useStore((s) => s.imageMapMessage);
  const targets = useStore((s) =>
    s.dominoEditingId ? s.imageMapTargets[s.dominoEditingId] : undefined,
  );
  const targetCount = targets?.length ?? 0;
  const imageMapEntryWarning = useStore((s) => s.imageMapEntryWarning);
  // Whether there is a colour to map *with*, read through the same function the
  // run itself uses (palette.ts), so a greyed-out button and an empty run can
  // never disagree about why.
  const inventoryEntries = useStore((s) => s.inventoryEntries);
  const imageMapColorScope = useStore((s) => s.imageMapColorScope);
  const imageMapExcludedColorIds = useStore((s) => s.imageMapExcludedColorIds);
  const paletteIsEmpty =
    imageMapPaletteEntries(inventoryEntries, imageMapColorScope, imageMapExcludedColorIds)
      .length === 0;
  const [explaining, setExplaining] = useState(false);

  const setImageMapActive = useStore((s) => s.setImageMapActive);
  const setColorDistance = useStore((s) => s.setColorDistance);
  const setPatchSample = useStore((s) => s.setPatchSample);
  const setDither = useStore((s) => s.setDither);
  const setDitherStrength = useStore((s) => s.setDitherStrength);
  const startColorMapping = useStore((s) => s.startColorMapping);
  const cancelColorMapping = useStore((s) => s.cancelColorMapping);
  const clearMappedColors = useStore((s) => s.clearMappedColors);

  /**
   * The dominoes under the picture, split by whether a run may colour them.
   *
   * `reachable` is what pressing Map Colors will fill — this session's target
   * list narrowed to the ones the picture reaches. `skipped` is the rest of what
   * is under the picture: dominoes that already had a colour when the mode was
   * switched on and are therefore not on the list.
   *
   * Counted from the frozen target list rather than from the colours the
   * dominoes currently hold, which matters: a run fills every target, so a live
   * count would drop to nothing the moment one finished and read as though the
   * tool had stopped working. This answers "what will the button do", which
   * stays true for the whole session.
   *
   * That is also why the dependencies are enough. Inside this mode the ordinary
   * domino tools are switched off and the element cannot be resized, so of the
   * three things this reads only the picture can move — no subscription to the
   * domino data's version is needed. (useDominoDataStore.get is a plain
   * imperative read of the buffer, not a subscription.)
   */
  const { reachable, skipped } = useMemo(() => {
    const none = { reachable: 0, skipped: 0 };
    if (!dominoEditingId || !targets || !ddObject || !image) return none;
    const data = useDominoDataStore.getState().get(dominoEditingId);
    if (!data) return none;
    const isUnderImage = makeDominoUnderImageTest(ddObject, image, data);
    if (!isUnderImage) return none;

    let reachable = 0;
    let skipped = 0;
    // Both lists run in ascending index order, so membership is a walk along
    // `targets` rather than a lookup structure built per recount.
    let t = 0;
    for (let i = 0; i < data.count; i++) {
      while (t < targets.length && targets[t] < i) t++;
      const onTheList = t < targets.length && targets[t] === i;
      if (!isUnderImage(i)) continue;
      if (onTheList) reachable++;
      else skipped++;
    }
    return { reachable, skipped };
  }, [dominoEditingId, targets, ddObject, image]);

  if (!dominoEditingId || !imageMapActive) return null;

  const mapping = colorMappingProgress !== null;

  return (
    <div className={styles.panel}>
      {/* The title takes the spare width, which is what pushes the close button
          to the right — the same arrangement HelpPanel's header uses. */}
      <div className={styles.header}>
        <div className={styles.title}>Map Image Colors</div>
        <button
          className={styles.closeBtn}
          onClick={() => setImageMapActive(false)}
          title="Close"
          aria-label="Close image mapping"
        >
          <RiCloseLine size={GLYPH_PX} />
        </button>
      </div>

      {/* The name is truncated with an ellipsis when it doesn't fit, so it needs
          a way to be read in full. A plain browser tooltip rather than
          FloatingTip: this is one static string, and the sidebar clipping that
          FloatingTip exists to escape doesn't apply to a native tooltip. */}
      {image && (
        <div className={styles.fileName} title={image.fileName}>
          {image.fileName}
        </div>
      )}

      {/* How many dominoes the button will fill, shown only when that is fewer
          than the picture covers — which is exactly when the number is worth
          saying. Over a field with nothing colored in yet it would only restate
          what the user can see, and the (?) beside it would answer a question
          nobody had. It appears the moment some of the dominoes under the
          picture are ones a run will leave alone. */}
      {image && skipped > 0 && (
        <div className={styles.targetCount}>
          <span>
            {reachable} Unassigned Domino{reachable === 1 ? "" : "es"}
          </span>
          <button
            className={styles.helpBtn}
            onClick={() => { setExplaining(true); }}
            title="More information"
            aria-label="Why this number"
          >
            ?
          </button>
        </div>
      )}

      {/* Sampling comes first because it is about reading the picture, where the
          two below it are about choosing a color from what was read. */}
      <div className={styles.row}>
        <div className={styles.rowLabel}>
          <span>Sampling</span>
        </div>
        <select
          className={styles.select}
          value={patchSampleId}
          onChange={(e) => { setPatchSample(e.target.value as PatchSampleId); }}
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
          onChange={(e) => { setColorDistance(e.target.value as ColorDistanceId); }}
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
          onChange={(e) => { setDither(e.target.value as DitherId); }}
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
          onChange={(e) => { setDitherStrength(Number(e.target.value) / 100); }}
          aria-label="How strongly the dither is applied"
        />
      </div>

      <div className={styles.actions}>
        <button
          className={styles.mapBtn}
          onClick={() => { startColorMapping(); }}
          disabled={!image || mapping || paletteIsEmpty}
          title="Give each domino this mode may color the nearest inventory color to the image"
        >
          <RiMagicLine size={GLYPH_PX} />
          Map Colors
        </button>
        <button
          className={styles.clearBtn}
          onClick={() => { clearMappedColors(); }}
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

      {/* Both of these only have something to say, so they are the
          acknowledge-only shape of ConfirmDialog — one button, which is also
          what Escape and the scrim do.

          Closing this one leaves the mode rather than dropping the user into a
          panel whose every control is pointless: whatever they do next has to
          start with getting out of here, since the target list is fixed for as
          long as the mode is on. Leaving is also how they fix it — coming back
          takes a fresh list. */}
      {imageMapEntryWarning !== "none" && (
        <ConfirmDialog
          message={
            imageMapEntryWarning === "no-dominoes" ? NO_DOMINOES_MESSAGE : ALL_COLORED_MESSAGE
          }
          cancelLabel="Close Image Mapping"
          onCancel={() => { setImageMapActive(false); }}
        />
      )}
      {explaining && (
        <ConfirmDialog
          message={TARGETS_EXPLANATION}
          cancelLabel="Close"
          onCancel={() => { setExplaining(false); }}
        />
      )}
    </div>
  );
}