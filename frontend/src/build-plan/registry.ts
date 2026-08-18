import type { ComponentType } from "react";

import type { AnyBuildPlanDefinition, BuildPlanOptionsProps } from "./base";
import { csvPlanDefinition } from "./csv/object-model";
import { layoutPlanDefinition } from "./layout/object-model";
import { sortPlanDefinition } from "./sort/object-model";

/**
 * Every printed build plan the app can produce.
 *
 * Registering one here is the only central edit: the DDObject menu iterates this
 * map and names no plan, and the options dialog resolves everything else through
 * the accessors below.
 */
export const BUILD_PLANS = {
  layout: layoutPlanDefinition,
  sort: sortPlanDefinition,
  csv: csvPlanDefinition,
} satisfies Record<string, AnyBuildPlanDefinition>;

export type BuildPlanId = keyof typeof BUILD_PLANS;

/** In menu order. */
export const BUILD_PLAN_LIST = Object.keys(BUILD_PLANS) as BuildPlanId[];

export const getBuildPlan = (id: BuildPlanId): AnyBuildPlanDefinition =>
  BUILD_PLANS[id];

/**
 * The options panel for a plan, with its own option type erased. Every accessor
 * that reaches past `AnyBuildPlanDefinition` casts here and nowhere else — see
 * base.ts for why the map has to be declared that way.
 */
export const getBuildPlanOptionsEditor = (
  id: BuildPlanId,
): ComponentType<BuildPlanOptionsProps<unknown>> =>
  BUILD_PLANS[id].Options as ComponentType<BuildPlanOptionsProps<unknown>>;

export const getBuildPlanDefaultOptions = (id: BuildPlanId): unknown =>
  BUILD_PLANS[id].defaultOptions;