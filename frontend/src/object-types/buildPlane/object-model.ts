import { RiSquareFill } from "@remixicon/react";

import type { DDObjectBase, DDObjectId, DDObjectTypeDefinition } from "../base";
import { fromMm, roundDisplay, toMm, type LengthUnit } from "../../units";
import BuildPlaneEditor from "./editor";
import BuildPlaneModeller from "./modeller";

/**
 * Level-0 root of the hierarchy: the surface a build sits on. It is the sole
 * source of truth for the plane's size and color — both the rendered plane and
 * the camera's fit read from here. Children are the FieldElements placed on it.
 */
export interface BuildPlaneDDObject extends DDObjectBase {
  type: "buildPlane";
  /** millimetres — kept in sync with displayWidth/displayUnit, see withDisplay*() below */
  width: number;
  /** millimetres — kept in sync with displayHeight/displayUnit, see withDisplay*() below */
  height: number;
  /** The value the user actually typed for width, in displayUnit. */
  displayWidth: number;
  /** The value the user actually typed for height, in displayUnit. */
  displayHeight: number;
  /** Unit displayWidth/displayHeight are expressed in; shared by both fields. */
  displayUnit: LengthUnit;
  /** 8-bit RGB as a "#rrggbb" hex string */
  color: string;
  /** DDObject ids of child elements */
  children: DDObjectId[];
}

/**
 * The single place the display-value/unit <-> millimetre relationship for a
 * BuildPlaneDDObject is expressed, mirroring fieldElement/object-model.ts's
 * normalizeSize. width/height (mm) are canonical for bounds()/the modeller;
 * displayWidth/displayHeight/displayUnit hold exactly what the user typed, so
 * the editor never shows float noise from repeatedly round-tripping a value
 * through mm and back.
 */
export const withDisplayWidth = (
  ddObject: BuildPlaneDDObject,
  displayWidth: number,
): Partial<BuildPlaneDDObject> => ({
  displayWidth,
  width: toMm(displayWidth, ddObject.displayUnit),
});

export const withDisplayHeight = (
  ddObject: BuildPlaneDDObject,
  displayHeight: number,
): Partial<BuildPlaneDDObject> => ({
  displayHeight,
  height: toMm(displayHeight, ddObject.displayUnit),
});

/**
 * Switching units doesn't change the plane's physical size — only how it's
 * displayed — so this recomputes displayWidth/displayHeight from the
 * unaffected canonical width/height, rather than converting the (possibly
 * already-rounded) display values themselves.
 */
export const withDisplayUnit = (
  ddObject: BuildPlaneDDObject,
  displayUnit: LengthUnit,
): Partial<BuildPlaneDDObject> => ({
  displayUnit,
  displayWidth: roundDisplay(fromMm(ddObject.width, displayUnit), displayUnit),
  displayHeight: roundDisplay(fromMm(ddObject.height, displayUnit), displayUnit),
});

export const buildPlaneDefinition: DDObjectTypeDefinition<BuildPlaneDDObject> = {
  type: "buildPlane",
  icon: RiSquareFill,
  defaultName: "Build Plane",
  create: (id) => ({
    id,
    type: "buildPlane",
    name: "Build Plane",
    width: 1500,
    height: 1500,
    displayWidth: 1.5,
    displayHeight: 1.5,
    displayUnit: "m",
    color: "#c8b28a",
    children: [],
  }),
  editor: BuildPlaneEditor,
  modeller: BuildPlaneModeller,
  // Origin is the plane's lower-left corner, so it sits at 0,0 by definition.
  bounds: ({ width, height }) => ({ x: 0, y: 0, width, height }),
  // The plane is the world frame, not a movable object — never selectable.
  selectable: false,
};