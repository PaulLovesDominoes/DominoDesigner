import type { ComponentType } from "react";

import type {
  AnyStructureOperationDefinition,
  StructureOperationBase,
  StructureOperationEditorProps,
  StructureOperationId,
  StructureOperationPreviewProps,
} from "./base";
import {
  gridDefinitionDefinition,
  type GridDefinitionOperation,
} from "./gridDefinition/object-model";
import {
  layerDefinitionDefinition,
  type LayerDefinitionOperation,
} from "./layerDefinition/object-model";

// ── Register structure operation types here (name → definition module) ──
// Adding a type: create an operation-types/<name>/ folder with an object-model.ts
// implementing StructureOperationDefinition, then add it to this map and to the
// StructureOperation union below, and give it a button in StructureToolbar.
// Everything else — the sidebar list, its ⋯ menu, the properties dialog, the
// warning banner, the canvas preview and the whole of undo — goes through the
// accessors below and names no type.
export const STRUCTURE_OPERATIONS = {
  layerDefinition: layerDefinitionDefinition,
  gridDefinition: gridDefinitionDefinition,
} satisfies Record<string, AnyStructureOperationDefinition>;

/** Union of all registered operation-type names. */
export type StructureOperationType = keyof typeof STRUCTURE_OPERATIONS;

/** Union of all concrete operation shapes — one member per registered type. */
export type StructureOperation = LayerDefinitionOperation | GridDefinitionOperation;

// There was a STRUCTURE_OPERATION_LIST here giving the toolbar's order. It went
// when the toolbar started writing its buttons out one at a time: the toolbar
// mixes operation commands with a view toggle, and a list of types can only say
// where the types sit relative to each other, never where the toggle goes among
// them. With its one reader gone it was a thing to keep in step with nothing.

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

/**
 * Why an operation of this type cannot be created right now, or undefined when
 * one can. The toolbar greys the command and uses the sentence as its tooltip.
 * A type declaring nothing can always be created.
 */
export const getOperationCreateDisabledReason = (
  type: StructureOperationType,
  operations: readonly StructureOperationBase[],
): string | undefined =>
  STRUCTURE_OPERATIONS[type].createDisabledReason?.(operations);

/**
 * Whether this type's preview stands in for the layer sheet — see
 * `previewDrawsLayerSheets` in base.ts. Read by LayerPlane and AllLayersView to
 * decide whether to step aside while an operation's properties are open.
 */
export const getOperationPreviewDrawsLayerSheets = (
  type: StructureOperationType,
): boolean => STRUCTURE_OPERATIONS[type].previewDrawsLayerSheets === true;