import type { StateCreator } from "zustand";

import type { AppState } from "../store";
import type { DDObjectId } from "../object-types/base";
import { BUILD_PLANS, type BuildPlanId } from "./registry";

/**
 * Printed build plans: which plan's options dialog is open, and the settings
 * each plan was last given.
 *
 * The settings are **settings**, not part of the design — nothing here is
 * undoable, exactly like image transparency or the Expand toggle. They are
 * remembered globally rather than per element, because someone printing several
 * fields is almost always printing them for the same template and the same
 * printer.
 *
 * ---- Import-cycle note ----
 * store.ts must remain the only importer of `createBuildPlanSlice`. This module
 * only imports a type from store.ts, so it is acyclic today; the rule is the
 * same one every other slice follows.
 */

/** Which plan is being set up, and for which element. */
export interface BuildPlanRequest {
  planId: BuildPlanId;
  ddObjectId: DDObjectId;
}

export interface BuildPlanSlice {
  buildPlanDialog: BuildPlanRequest | null;
  openBuildPlan: (planId: BuildPlanId, ddObjectId: DDObjectId) => void;
  closeBuildPlan: () => void;

  /**
   * Each plan's current settings, with their types erased — a single record
   * cannot hold several different option shapes. The dialog casts them back at
   * the registry seam, which is the only place that knows which plan is which.
   */
  buildPlanOptions: Record<BuildPlanId, unknown>;
  setBuildPlanOptions: (planId: BuildPlanId, patch: object) => void;
}

/** Starts every plan at its own declared defaults. */
function defaultBuildPlanOptions(): Record<BuildPlanId, unknown> {
  const options = {} as Record<BuildPlanId, unknown>;
  for (const id of Object.keys(BUILD_PLANS) as BuildPlanId[]) {
    options[id] = BUILD_PLANS[id].defaultOptions;
  }
  return options;
}

export const createBuildPlanSlice: StateCreator<
  AppState,
  [],
  [],
  BuildPlanSlice
> = (set) => ({
  buildPlanDialog: null,

  openBuildPlan: (planId, ddObjectId) =>
    set({ buildPlanDialog: { planId, ddObjectId } }),

  closeBuildPlan: () => set({ buildPlanDialog: null }),

  buildPlanOptions: defaultBuildPlanOptions(),

  setBuildPlanOptions: (planId, patch) =>
    set((s) => ({
      buildPlanOptions: {
        ...s.buildPlanOptions,
        [planId]: { ...(s.buildPlanOptions[planId] as object), ...patch },
      },
    })),
});