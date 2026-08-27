import type { ComponentType } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

/**
 * The contract every structure operation type implements.
 *
 * A structure is described by an ordered list of *operations* — "make the next
 * two layers 48mm tall", and in later releases things like "put a tower here".
 * Each type lives in its own folder under operation-types/ and is registered in
 * registry.ts; the toolbar, the sidebar list, its menu, the properties dialog
 * and the canvas preview all reach a type through the registry's accessors and
 * none of them names a type. Adding a type is a folder plus one registry line.
 *
 * This mirrors object-types/base.ts on the Designer side, which the repo-root
 * CLAUDE.md names as the template for extensible subsystems. It is a separate
 * contract rather than a shared one because the two describe different things:
 * a DDObject is a thing standing on the build plane, an operation is a step in
 * a recipe.
 */

/** System-generated unique id for an operation, e.g. "SOP-1". */
export type StructureOperationId = string;

/** Properties common to every structure operation. */
export interface StructureOperationBase {
  /** System-generated unique id, immutable, of the form "SOP-#". */
  id: StructureOperationId;
  /** User-friendly name; the store numbers it when the operation is created. */
  name: string;
  /** Registry key / discriminant identifying the operation's type. */
  type: string;
}

/**
 * Props handed to an operation type's property editor by the operation dialog.
 * `update` writes through to the store immediately — the dialog owns the
 * Create/Update and Cancel semantics, so editors never buffer a draft of their
 * own.
 */
export interface StructureOperationEditorProps<
  T extends StructureOperationBase = StructureOperationBase,
> {
  operation: T;
  update: (patch: Partial<T>) => void;
}

/**
 * Props handed to an operation type's canvas preview while its dialog is open.
 *
 * The whole document comes down as a prop rather than the preview reaching into
 * the store for it, so a preview is a pure function of what it is handed and the
 * host owns the one store subscription. That also keeps a preview module out of
 * the store's import graph, which matters here: the store imports the registry,
 * the registry imports every type's definition, and a definition names its
 * preview — so a preview importing the store back would close a cycle.
 */
export interface StructureOperationPreviewProps<
  T extends StructureOperationBase = StructureOperationBase,
> {
  operation: T;
  /** Every operation in the structure, in order — including this one. */
  operations: readonly StructureOperationBase[];
  /** The layer being worked on, for a preview that draws at a layer's height. */
  layer: number;
}

export interface StructureOperationDefinition<
  T extends StructureOperationBase = StructureOperationBase,
> {
  /** Discriminant, must match the key this definition is registered under. */
  type: string;
  /** Icon shown for operations of this type, in the sidebar and the toolbar. */
  icon: RemixiconComponentType;
  /**
   * Default user-friendly name, unnumbered — the store appends the number, so
   * a flat list of near-identical rows can be told apart ("Layer Definition 1",
   * "Layer Definition 2").
   */
  defaultName: string;
  /**
   * Wording for the toolbar command that creates one, e.g. "New Layer
   * Definition".
   *
   * Optional, because not every type is made from the toolbar: a domino group
   * comes into being when the first domino is placed on the canvas, and a type
   * created by a gesture rather than by a command has no button, and so no
   * wording for one.
   */
  toolbarLabel?: string;
  /** Build an initial instance of this type with default values. */
  create(id: StructureOperationId): T;
  /**
   * Optional: a short something to print ahead of the operation's name in the
   * sidebar, or undefined for a type with nothing to say there.
   *
   * A domino group uses it for its count, "(12)". That cannot simply be written
   * into `name`, because the name is the user's — the properties dialog offers
   * it for editing — and rewriting it on every placement would throw away
   * whatever they had called the group.
   */
  rowBadge?(operation: T): string | undefined;
  /** Editor for this operation's properties, rendered in the operation dialog. */
  editor: ComponentType<StructureOperationEditorProps<T>>;
  /**
   * Optional: a sentence saying why this operation has no effect where it sits,
   * or undefined when there is nothing wrong. Shown at the top of its dialog and
   * used to redden its sidebar row.
   *
   * It takes the whole document because "has no effect" is always a statement
   * about this operation's place in the list — a layer definition that would be
   * fine on its own defines nothing once an earlier one has claimed every layer.
   */
  warning?(
    operation: T,
    operations: readonly StructureOperationBase[],
  ): string | undefined;
  /**
   * Optional three.js scene nodes drawn *only* while this operation's dialog is
   * open, so the user can see what they are describing. Types with nothing to
   * show omit it, and StructurePreview skips them.
   */
  preview?: ComponentType<StructureOperationPreviewProps<T>>;
  /**
   * Optional: whether this type's preview draws sheets at the layer heights.
   *
   * The ordinary layer sheet and the Show All Layers view both step aside for a
   * preview that does, since two sets at the same heights with the same material
   * would add up and the layers being edited would come out denser than the rest
   * for no reason the user could name. A preview that draws something else — a
   * grid definition's dots, say — needs the layer sheet left where it is, or its
   * dots float over nothing.
   *
   * Named for what the preview *does* rather than for what hiding it achieves,
   * so a new type's author can answer it without reading either consumer.
   */
  previewDrawsLayerSheets?: boolean;
}

/**
 * Element type for the registry map. `editor` puts T in a position that stops
 * concrete definitions being assignable to
 * StructureOperationDefinition<StructureOperationBase>, so the registry erases T
 * and the accessors cast back. This is the one place that erasure is allowed.
 */
export type AnyStructureOperationDefinition = StructureOperationDefinition<any>;