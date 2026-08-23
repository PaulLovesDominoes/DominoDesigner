import type { ComponentType } from "react";

import type {
  AnyStructureOperationDefinition,
  StructureOperationBase,
  StructureOperationEditorProps,
  StructureOperationId,
  StructureOperationPreviewProps,
} from "./base";
import {
  layerDefinitionDefinition,
  type LayerDefinitionOperation,
} from "./layerDefinition/object-model";

// ── Register structure operation types here (name → definition module) ──
// Adding a type: create an operation-types/<name>/ folder with an object-model.ts
// implementing StructureOperationDefinition, then add it to this map, to
// STRUCTURE_OPERATION_LIST, and to the StructureOperation union below. Those
// three lines are the only central edit — nothing else in the folder names a
// type.
export const STRUCTURE_OPERATIONS = {
  layerDefinition: layerDefinitionDefinition,
} satisfies Record<string, AnyStructureOperationDefinition>;

/** Union of all registered operation-type names. */
export type StructureOperationType = keyof typeof STRUCTURE_OPERATIONS;

/** Union of all concrete operation shapes — one member per registered type. */
export type StructureOperation = LayerDefinitionOperation;

/**
 * The order the toolbar offers the operation types in. Spelled out rather than
 * taken from the map's key order, so a type's place in the toolbar is a decision
 * rather than an accident of how the object literal was typed.
 */
export const STRUCTURE_OPERATION_LIST: StructureOperationType[] = ["layerDefinition"];

// ── Registry-driven accessors — no per-type switch anywhere else ──

export const getOperationIcon = (type: StructureOperationType) =>
  STRUCTURE_OPERATIONS[type].icon;

export const getOperationDefaultName = (type: StructureOperationType) =>
  STRUCTURE_OPERATIONS[type].defaultName;

export const getOperationToolbarLabel = (type: StructureOperationType) =>
  STRUCTURE_OPERATIONS[type].toolbarLabel;

export const createStructureOperation = (
  type: StructureOperationType,
  id: StructureOperationId,
): StructureOperation => STRUCTURE_OPERATIONS[type].create(id) as StructureOperation;

/**
 * The property editor to render for an operation of this type. The cast undoes
 * the registry's type erasure (see AnyStructureOperationDefinition); callers
 * pass the matching operation, which the definition's own typing guarantees.
 */
export const getOperationEditor = (type: StructureOperationType) =>
  STRUCTURE_OPERATIONS[type].editor as ComponentType<
    StructureOperationEditorProps<StructureOperation>
  >;

/**
 * The canvas preview for an operation of this type, or undefined for a type
 * with nothing to show while its dialog is open. Cast as per getOperationEditor.
 */
export const getOperationPreview = (type: StructureOperationType) =>
  STRUCTURE_OPERATIONS[type].preview as
    | ComponentType<StructureOperationPreviewProps<StructureOperation>>
    | undefined;

/**
 * Why this operation has no effect where it sits, or undefined when it does
 * have one. Takes the instance and the whole document, because that is the
 * question — see `warning` in base.ts. Cast as per getOperationEditor: indexing
 * by a union `type` otherwise narrows the per-type parameter down to never.
 */
export const getOperationWarning = (
  operation: StructureOperation,
  operations: readonly StructureOperationBase[],
): string | undefined => {
  const warning = STRUCTURE_OPERATIONS[operation.type].warning as
    | ((
        operation: StructureOperation,
        operations: readonly StructureOperationBase[],
      ) => string | undefined)
    | undefined;
  return warning?.(operation, operations);
};