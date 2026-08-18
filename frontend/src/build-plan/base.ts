import type { ComponentType } from "react";
import type { RemixiconComponentType } from "@remixicon/react";

import type { PlanModel } from "./model";

/**
 * What a printed build plan is.
 *
 * One definition per document, each in its own folder, listed once in
 * registry.ts. The DDObject menu, the options dialog and the print handler are
 * all driven off that map and none of them names a plan, so a third document — a
 * cut list, a per-template pick list — is a folder plus one registry line.
 *
 * ---- Why `render` returns a string, and where the PDF seam is ----
 *
 * A document is generated in two steps, but only the second is on this contract:
 * a `paginate` step turning the plan model into pure page geometry in
 * millimetres, then an emit step turning that geometry into markup. The split is
 * inside each document's own folder, because that is where a second backend
 * would be added — a PDF writer would consume the same paginated geometry and
 * sit beside `emitHtml`, leaving the model, the pagination and the options
 * untouched. Putting the split on this contract instead would put a second type
 * parameter on every definition for no gain today.
 */
export interface BuildPlanDefinition<TOptions> {
  id: string;
  /** The DDObject menu's item text, e.g. "Print Layout". */
  menuLabel: string;
  icon: RemixiconComponentType;
  /** The options dialog's title. */
  title: string;
  defaultOptions: TOptions;
  Options: ComponentType<BuildPlanOptionsProps<TOptions>>;
  /** Names the browser tab and the document, e.g. "Layout — Main Field". */
  documentTitle(model: PlanModel): string;
  render(model: PlanModel, options: TOptions): string;
  /** The options dialog's primary button, e.g. "Output for Print". */
  actionLabel: string;
  /**
   * Hands the finished document to the user — opens it in a tab for printing, or
   * saves it as a file. Returns null when that worked, or the message to show
   * when the browser refused; a pop-up blocker is the case that happens.
   *
   * On the definition rather than in the dialog so that a document which is
   * saved rather than printed needs no branch there. The two ways of delivering
   * one live in html.ts and download.ts, and a definition just names the one it
   * wants.
   */
  deliver(document: string, model: PlanModel): string | null;
}

export interface BuildPlanOptionsProps<TOptions> {
  /**
   * Passed in so an options panel can show what the settings will actually
   * produce — the layout's cell size and page count are a pure function of the
   * model and the options, and are far more use before printing than after.
   */
  model: PlanModel;
  options: TOptions;
  update: (patch: Partial<TOptions>) => void;
}

/**
 * `Options` and `render` both take TOptions as an argument rather than returning
 * one, so a map holding several definitions with different option types cannot
 * be indexed without collapsing them. The erasure belongs at the registry seam
 * and nowhere else — the same arrangement DD_OBJECT_TYPES uses.
 */
export type AnyBuildPlanDefinition = BuildPlanDefinition<any>;