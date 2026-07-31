import type { ComponentType } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

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
 * A DDObject's axis-aligned footprint on the build plane, in mm, measured from
 * the plane's lower-left origin. What the camera needs to fit or frame it.
 */
export interface DDObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
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
   * <Canvas>. Types with no visual representation yet (fieldElement) omit it.
   */
  modeller?: ComponentType<DDObjectModellerProps<T>>;
  /**
   * Optional footprint of a given instance, used by the camera to fit and
   * frame. Types with no spatial extent omit it, and the camera skips them.
   * May also return undefined per-instance, for a type whose footprint depends
   * on data that hasn't been generated yet.
   */
  bounds?(ddObject: T): DDObjectBounds | undefined;
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
   * Optional: realise a target footprint on this instance — the write path for
   * cursor-based move and resize, the manipulation analogue of
   * `createFromRegion`. Returns the store patch that makes the instance occupy
   * `bounds`, or undefined if the target is too small/invalid (the manipulation
   * tool then discards that drag frame, keeping the last valid state). Per-type
   * because each type maps a rectangle onto its own position/size fields.
   */
  setBounds?(ddObject: T, bounds: DDObjectBounds): Partial<T> | undefined;
  /**
   * Optional: how a region drawn on the build plane becomes an instance of
   * this type. Returns the creation patch (merged over create()'s defaults),
   * or undefined if the region is too small/invalid — the placement tool
   * discards drags like that rather than creating a degenerate DDObject.
   */
  createFromRegion?(region: DDObjectBounds): Partial<T> | undefined;
}

/**
 * Element type for the registry map. `editor` puts T in a contravariant
 * position, so concrete definitions aren't assignable to
 * DDObjectTypeDefinition<DDObjectBase>; the registry erases T instead and the
 * accessor casts back. This is the one place that erasure is allowed.
 */
export type AnyDDObjectTypeDefinition = DDObjectTypeDefinition<any>;