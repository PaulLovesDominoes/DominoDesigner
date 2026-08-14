import type { ComponentType } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

import type { DominoColorClipboardItem } from "../dominoes/clipboardItem";
import type { DominoSelectionEntry } from "../dominoes/selectionStore";
import type { Bounds } from "../types";

/** System-generated unique id for a DDObject in the hierarchy, e.g. "DDO-1". */
export type DDObjectId = string;

/** Properties common to every DDObject in the build hierarchy. */
export interface DDObjectBase {
  /** System-generated unique id, immutable, of the form "DDO-#". */
  id: DDObjectId;
  /** User-friendly name; defaults per DDObject type. */
  name: string;
  /** Registry key / discriminant identifying the DDObject's type. */
  type: string;
}

/**
 * Props handed to a DDObject type's property editor by the standard properties
 * dialog. `update` writes through to the store immediately — the dialog owns
 * the Save/Cancel semantics, so editors never buffer a draft of their own.
 */
export interface DDObjectEditorProps<T extends DDObjectBase = DDObjectBase> {
  ddObject: T;
  update: (patch: Partial<T>) => void;
}

/**
 * Props handed to a DDObject type's modeller by the scene walker. Modellers are
 * pure functions of their DDObject — the walker owns the store subscription.
 */
export interface DDObjectModellerProps<T extends DDObjectBase = DDObjectBase> {
  ddObject: T;
}

/**
 * A domino's place in its parent's own row/column-like ordering. See
 * `dominoRowCol` below for what "row/column-like" means for a type that isn't
 * literally a grid.
 */
export interface DominoRowCol {
  row: number;
  col: number;
}

/**
 * Extra size added to a domino's drawn footprint, in mm, per side: x0/y0/z0 on
 * the -X/-Y/-Z faces, x1/y1/z1 on the +X/+Y/+Z. Per side rather than per axis so
 * a type whose dominoes don't sit centred in the room around them can grow into
 * the space it actually has, rather than growing symmetrically and overlapping on
 * one edge. See `dominoExpansion` below.
 */
export interface DominoExpansion {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/**
 * The contract every DDObject-type module implements. Registering a type is a
 * matter of exporting one of these; the store and the sidebar hierarchy drive
 * everything off the registry's accessors rather than per-type branching, so
 * new types (including third-party ones) plug in without touching the rest of
 * the app.
 */
export interface DDObjectTypeDefinition<T extends DDObjectBase = DDObjectBase> {
  /** Discriminant, must match the key this definition is registered under. */
  type: string;
  /** Icon shown for DDObjects of this type (e.g. in the sidebar hierarchy). */
  icon: RemixiconComponentType;
  /** Default user-friendly name for new DDObjects of this type. */
  defaultName: string;
  /** Build an initial instance of this type with default values. */
  create(id: DDObjectId): T;
  /** Editor for this type's properties, rendered in the properties dialog. */
  editor: ComponentType<DDObjectEditorProps<T>>;
  /**
   * Optional three.js scene-building for this type, drawn inside the designer's
   * <Canvas>. Types with no visual representation omit it, and Scene.tsx skips
   * them.
   */
  modeller?: ComponentType<DDObjectModellerProps<T>>;
  /**
   * Optional footprint of a given instance, used by the camera to fit and
   * frame. Types with no spatial extent omit it, and the camera skips them.
   * May also return undefined per-instance, for a type whose footprint depends
   * on data that hasn't been generated yet.
   */
  bounds?(ddObject: T): Bounds | undefined;
  /**
   * Whether instances of this type can be selected and directly manipulated on
   * the canvas / in the hierarchy. Defaults to selectable; set false to opt out
   * (the root BuildPlane does — it is the world frame, not a movable object).
   * A type is only actually selectable when it also declares `bounds()`, since
   * the selection overlay needs a footprint to draw.
   */
  selectable?: boolean;
  /**
   * Whether instances of this type expose a domino-editing mode (double-click on
   * the canvas or in the object hierarchy to select/arrange their dominoes).
   * Defaults to false. Most domino-producing types will eventually set this
   * true — false is simply the correct default until a type has actually
   * finished implementing domino editing.
   */
  dominoEditable?: boolean;
  /**
   * For domino-producing types only: how far to grow each domino's *drawn*
   * footprint while domino editing mode's Expand toggle is on, so tightly-spaced
   * dominoes are easier to click and rubber-band. Purely a view aid — it never
   * touches the stored layout, is not undoable, and resets on leaving the mode.
   *
   * The type decides the amount from its own layout knowledge (a field grows by
   * half its spacing on each side, so grown dominoes tile edge to edge). Returning
   * undefined means this instance has nothing to gain from expanding, which is
   * also what disables the toolbar button — one member is deliberately both the
   * amount and the capability flag.
   */
  dominoExpansion?(ddObject: T): DominoExpansion | undefined;
  /**
   * For domino-producing types only: a stable identifier for the domino at
   * `flatIndex`, given the ddObject's CURRENT layout parameters. Used by
   * dominoes/colorMemory.ts to preserve colors across a regenerate (resize,
   * remount, undo) even though a flat index's meaning can shift whenever a
   * type's own layout parameters change. **Stability contract**: the id
   * returned for a given logical cell must not depend on the parent's
   * current physical size — the same cell must always map to the same id
   * regardless of how many dominoes the parent currently has, or memory
   * recorded at one size becomes meaningless (or, worse, silently wrong)
   * when looked up at another. fieldElement encodes each cell's `(row, col)`
   * *relative to its anchor* — the live 0-based row/col minus the persisted
   * `originRow`/`originCol`, which count how many rows/columns currently sit
   * before that anchor — precisely so that a resize from any edge doesn't
   * change a pre-existing domino's id. Both go negative when those edges
   * shrink past the anchor, hence the bias its encoding adds. The *decode*
   * from `flatIndex` to the live `(row, col)` depends on the current
   * `dominoes_per_row`; the anchor-relative meaning laid over it never does.
   * A future spiral/rings type must uphold the same contract for its own
   * scheme.
   * Types with no cell-id function simply don't get color preservation
   * across a regenerate — today that's every type except fieldElement.
   */
  dominoCellId?(ddObject: T, flatIndex: number): number;
  /**
   * For domino-producing types: where `flatIndex` sits in this instance's own
   * row/column-like ordering, and (`dominoIndexAt`) the inverse. Together they
   * are what lets a pattern of colors copied from one element be pasted onto a
   * *different* kind of element — dominoes are organised into lines by their
   * very nature, so nearly every element type is row/col-like under some
   * reading: a field is literally rows and columns; concentric circles and
   * spirals are polar (col = rings out from the centre, row = position around);
   * a line is row 0, col 0..n; a wall is a short wide field.
   *
   * Contract:
   * - **Inverses** over the live range:
   *   `dominoIndexAt(dd, dominoRowCol(dd, i)) === i`.
   * - **Structurally meaningful**: dominoes adjacent in the physical layout
   *   differ by 1 in exactly one coordinate. That adjacency is the whole
   *   transferable content of a pattern; a mapping that merely enumerated the
   *   dominoes would satisfy the inverse law and still paste noise.
   * - **Not required to be stable across resizes**, unlike `dominoCellId`,
   *   which must survive one. The two answer different questions —
   *   `dominoCellId` is an opaque persistent identity, this is live geometry —
   *   so a type may implement the former in terms of the latter (fieldElement
   *   does), but they must not be merged.
   * - **No normalisation.** Values need no particular origin; paste works
   *   relative to the copied pattern's own min corner.
   * - For planar types, `row` should increase in the direction the user
   *   perceives as **up** and `col` to the right, so paste's corner
   *   correlation lands on the visual upper-left. Non-planar types define
   *   their own convention and the correlation becomes structural rather than
   *   visual — the correct generalisation, not a compromise.
   *
   * A type declaring neither simply gets no cross-element paste.
   */
  dominoRowCol?(ddObject: T, flatIndex: number): DominoRowCol;
  /**
   * The inverse of `dominoRowCol` — see its contract. Returns undefined when
   * (row, col) falls outside this instance's dominoes, and *that return is the
   * per-type control over paste's edge behavior*: a field rejects out-of-range
   * so a stamped pattern is clipped at the boundary, whereas a concentric-circle
   * type would wrap `row` all the way around the ring while still rejecting an
   * out-of-range `col`.
   */
  dominoIndexAt?(ddObject: T, row: number, col: number): number | undefined;
  /**
   * Snap an arbitrary point in this instance's parent-relative mm — the space
   * DominoData.positions lives in — onto its own grid.
   *
   * Domino editing mode's shape-select gestures use it so a shape can be placed
   * on the lattice rather than wherever the cursor happened to land. That is
   * what makes a circle symmetric: it is impossible to click exactly on a
   * domino's midpoint or exactly between two, and a centre a hair off takes a
   * different count on each side. With the centre snapped, the midpoints are
   * symmetric about it and the count matches at *every* radius.
   *
   * Declaring it is the whole of "this type has a grid" — a type that omits it
   * is simply never snapped, and shape-select substitutes an identity so no
   * variant has to branch on support. What counts as a snap point is entirely
   * the type's business; a field offers every domino's centre plus every
   * midpoint between them.
   *
   * Must NOT clamp to the instance's current extent. A shape's origin
   * legitimately sits outside it — a large circle whose arc merely clips the
   * field is centred well away from it — so the lattice returned here is
   * conceptually infinite.
   */
  snapShapePoint?(ddObject: T, x: number, y: number): { x: number; y: number };
  /**
   * The point on the build plane, in world mm, that this instance's dominoes
   * keep their positions against — the origin anything laid *over* the grid must
   * be placed relative to.
   *
   * The boundary box is the wrong origin for that, which is the whole reason
   * this member exists. Dragging a field's west or south handle moves its
   * `position` while every existing domino deliberately stays exactly where it
   * was on the build plane, their parent-relative coordinates being recomputed
   * to compensate (see CLAUDE.md's "The field's anchor model"). So a picture
   * stored against `position` would slide out of registration with the very
   * dominoes it is there to be matched against, by exactly that delta. A field
   * returns its anchor, which is the point that does not move.
   *
   * Declaring it is the whole of "this type has such a point". A type that omits
   * it falls back to its bounds() corner, which is right for a type whose box
   * and grid are the same thing.
   */
  dominoLayoutAnchor?(ddObject: T): { x: number; y: number };
  /**
   * Optional override of how copied domino colors land on this instance.
   * Returns the flat indices to recolor and each one's colorId, or undefined
   * when the paste means nothing here.
   *
   * Declaring this is rarely necessary: paste defaults to the generic
   * row/col algorithm in dominoes/rowColPaste.ts, which works for any type
   * declaring `dominoRowCol`/`dominoIndexAt` — nothing overrides it today.
   * It exists so a type whose paste semantics genuinely differ from
   * corner-correlation-plus-tiling isn't forced into them. Implementations
   * must be pure; the caller applies the result as one undoable operation.
   */
  pasteDominoColors?(
    ddObject: T,
    item: DominoColorClipboardItem,
    selection: DominoSelectionEntry,
  ): Array<[index: number, colorId: number]> | undefined;
  /**
   * Optional: realise a target footprint on this instance — the write path for
   * cursor-based move and resize, the manipulation analogue of
   * `createFromRegion`. Returns the store patch that makes the instance occupy
   * `bounds`, or undefined if the target is too small/invalid (the manipulation
   * tool then discards that drag frame, keeping the last valid state). Per-type
   * because each type maps a rectangle onto its own position/size fields.
   */
  setBounds?(ddObject: T, bounds: Bounds): Partial<T> | undefined;
  /**
   * Optional: how a region drawn on the build plane becomes an instance of
   * this type. Returns the creation patch (merged over create()'s defaults),
   * or undefined if the region is too small/invalid — the placement tool
   * discards drags like that rather than creating a degenerate DDObject.
   */
  createFromRegion?(region: Bounds): Partial<T> | undefined;
}

/**
 * Element type for the registry map. `editor` puts T in a contravariant
 * position, so concrete definitions aren't assignable to
 * DDObjectTypeDefinition<DDObjectBase>; the registry erases T instead and the
 * accessor casts back. This is the one place that erasure is allowed.
 */
export type AnyDDObjectTypeDefinition = DDObjectTypeDefinition<any>;