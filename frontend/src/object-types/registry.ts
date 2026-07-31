import type { ComponentType } from "react";

import type {
  AnyDDObjectTypeDefinition,
  DDObjectBounds,
  DDObjectEditorProps,
  DDObjectId,
  DDObjectModellerProps,
} from "./base";
import { buildPlaneDefinition, type BuildPlaneDDObject } from "./buildPlane/object-model";
import { fieldElementDefinition, type FieldElementDDObject } from "./fieldElement/object-model";

// ── Register DDObject types here (name → definition module) ──
// Adding a type: create an object-types/<name>.ts implementing
// DDObjectTypeDefinition, then add it to this map and to the DDObject union below.
export const DD_OBJECT_TYPES = {
  buildPlane: buildPlaneDefinition,
  fieldElement: fieldElementDefinition,
} satisfies Record<string, AnyDDObjectTypeDefinition>;

/** Union of all registered DDObject-type names. */
export type DDObjectType = keyof typeof DD_OBJECT_TYPES;

/** Union of all concrete DDObject shapes — one member per registered type. */
export type DDObject = BuildPlaneDDObject | FieldElementDDObject;

// ── Registry-driven accessors — no per-type switch anywhere else ──

export const getDDObjectIcon = (type: DDObjectType) => DD_OBJECT_TYPES[type].icon;

export const getDDObjectDefaultName = (type: DDObjectType) =>
  DD_OBJECT_TYPES[type].defaultName;

export const createDDObject = (type: DDObjectType, id: DDObjectId): DDObject =>
  DD_OBJECT_TYPES[type].create(id) as DDObject;

/**
 * The property editor to render for a DDObject of this type. The cast undoes
 * the registry's type erasure (see AnyDDObjectTypeDefinition); callers pass the
 * matching DDObject, which the definition's own typing already guarantees.
 */
export const getDDObjectEditor = (type: DDObjectType) =>
  DD_OBJECT_TYPES[type].editor as ComponentType<DDObjectEditorProps<DDObject>>;

/**
 * The three.js modeller for a DDObject of this type, or undefined for types with
 * no visual representation yet. Cast as per getDDObjectEditor.
 */
export const getDDObjectModeller = (type: DDObjectType) =>
  DD_OBJECT_TYPES[type].modeller as
    | ComponentType<DDObjectModellerProps<DDObject>>
    | undefined;

/**
 * This DDObject's footprint on the build plane, or undefined if its type declares
 * none (it has no spatial extent the camera can use). Takes the DDObject, not the
 * type, because the footprint depends on the instance's values. The cast undoes
 * the registry's type erasure, same as getDDObjectEditor: indexing by a union
 * `type` otherwise intersects the per-type bounds params down to `never`.
 */
export const getDDObjectBounds = (ddObject: DDObject): DDObjectBounds | undefined => {
  const bounds = DD_OBJECT_TYPES[ddObject.type].bounds as
    | ((ddObject: DDObject) => DDObjectBounds | undefined)
    | undefined;
  return bounds?.(ddObject);
};

/**
 * Whether this DDObject can be selected and directly manipulated. A type opts
 * out with `selectable: false` (the root BuildPlane does); callers that draw
 * the selection overlay additionally require `getDDObjectBounds` to be defined.
 */
export const isDDObjectSelectable = (ddObject: DDObject): boolean =>
  DD_OBJECT_TYPES[ddObject.type].selectable !== false;

/**
 * Whether this DDObject exposes a domino-editing mode (double-click to
 * select/arrange its dominoes). A type opts in with `dominoEditable: true`
 * (fieldElement does); defaults to false.
 */
export const isDominoEditable = (ddObject: DDObject): boolean =>
  DD_OBJECT_TYPES[ddObject.type].dominoEditable === true;

/**
 * The store patch that makes `ddObject` occupy `bounds` (cursor move/resize), or
 * undefined if its type declares no `setBounds`, or if `bounds` was too
 * small/invalid. Takes the instance, and casts to undo the registry's type
 * erasure, exactly like getDDObjectBounds.
 */
export const applyDDObjectBounds = (
  ddObject: DDObject,
  bounds: DDObjectBounds,
): Partial<DDObject> | undefined => {
  const setBounds = DD_OBJECT_TYPES[ddObject.type].setBounds as
    | ((ddObject: DDObject, bounds: DDObjectBounds) => Partial<DDObject> | undefined)
    | undefined;
  return setBounds?.(ddObject, bounds);
};

/**
 * The creation patch for a region drawn on the build plane, or undefined if
 * this type doesn't support region placement, or if `region` was too
 * small/invalid for it. Cast as per getDDObjectBounds: indexing by a union
 * `type` otherwise intersects the per-type params down to `never`.
 */
export const getDDObjectCreateFromRegion = (
  type: DDObjectType,
  region: DDObjectBounds,
): Partial<DDObject> | undefined => {
  const createFromRegion = DD_OBJECT_TYPES[type].createFromRegion as
    | ((region: DDObjectBounds) => Partial<DDObject> | undefined)
    | undefined;
  return createFromRegion?.(region);
};