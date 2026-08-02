import type { ClipboardItemBase } from "../clipboard/object-model";
import type { DDObject } from "../object-types/registry";

/**
 * A copied set of domino colors — the clipboard payload domino editing mode
 * produces and consumes. Type-only module: it names DDObject purely as a type,
 * so the clipboard <-> registry reference here costs no runtime import and
 * introduces no module cycle.
 *
 * Colors travel as inventory colorIds, not RGB, for the same reason
 * DominoData.colorIds does — see dominoes/object-model.ts. Pasting a color
 * whose inventory entry was recoloured in between therefore paints the *new*
 * RGB, which is the intended behavior.
 */
export interface DominoColorClipboardItem extends ClipboardItemBase {
  type: "dominoColors";
  /**
   * The element the colors were copied from, snapshotted at copy time.
   * DDObjects are immutable copy-on-write, so holding the reference *is* the
   * snapshot (the same trick colorMemory.ts's `lastDDObject` uses). Paste needs
   * it to decode `indices` through the source type's `dominoRowCol` as the
   * source was *when copied*, which is what keeps a buffer valid after the
   * source has been resized or even deleted.
   */
  sourceDDObject: DDObject;
  /**
   * Flat indices into the SOURCE's DominoData arrays, ascending, as of the
   * copy. Meaningful only together with `sourceDDObject`, through that type's
   * `dominoRowCol` — a flat index means nothing on its own.
   *
   * Deliberately stored raw rather than pre-decoded to (row, col): the source
   * snapshot is already here and decoding is trivial, so keeping the item in
   * the source's own terms means a future richer item (one that also carried
   * `hidden` tombstones, say) extends this without a parallel coordinate
   * representation to keep in step.
   */
  indices: Uint32Array;
  /** Inventory colorIds parallel to `indices` (0 = unpainted). */
  colorIds: Uint32Array;
}