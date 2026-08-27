import type { RemixiconComponentType } from "@remixicon/react";

import {
  DominoFlatIcon,
  DominoSidewaysIcon,
  DominoUprightIcon,
} from "../icons";
import type { DominoOrientation } from "./operation-types/dominoGroup/dominoes";

/**
 * How each way up a domino can be placed is offered to the user: its glyph, its
 * name, and the key that chooses it.
 *
 * **One table, read by both the toolbar and the hint bar**, so a domino cannot
 * appear under one drawing on the button and a different one in the bar saying
 * which button is pressed. This is the same reason the Designer's PLACEMENT_TOOLS
 * exists, and it sits here in the screen's own chrome rather than in
 * operation-types/dominoGroup/ for the same reason that folder holds no icons:
 * what a thing looks like on a button is not a fact about the structure being
 * designed.
 *
 * The order is the order the buttons appear in, tallest first — which reads as
 * the domino being tipped over, once and then again.
 */
export interface DominoOrientationCommand {
  orientation: DominoOrientation;
  icon: RemixiconComponentType;
  /** How the orientation is named in the hint bar and in a button's tooltip. */
  label: string;
  /** The single key that chooses it. Shown to the user, so it is upper case. */
  shortcutKey: string;
}

export const DOMINO_ORIENTATION_COMMANDS: readonly DominoOrientationCommand[] = [
  {
    orientation: "upright",
    icon: DominoUprightIcon,
    label: "Upright",
    shortcutKey: "U",
  },
  {
    orientation: "sideways",
    icon: DominoSidewaysIcon,
    label: "Sideways",
    shortcutKey: "S",
  },
  { orientation: "flat", icon: DominoFlatIcon, label: "Flat", shortcutKey: "F" },
];

/** The entry for one orientation. Every orientation has one. */
export function dominoOrientationCommand(
  orientation: DominoOrientation,
): DominoOrientationCommand {
  // The table covers all three, so the fallback is only here to keep the return
  // type free of undefined; it is not reachable.
  return (
    DOMINO_ORIENTATION_COMMANDS.find((c) => c.orientation === orientation) ??
    DOMINO_ORIENTATION_COMMANDS[1]
  );
}

/**
 * A button's tooltip, e.g. "Upright (U)".
 *
 * The name and the key, and deliberately not how tall the domino stands: the
 * drawing on the button already says that, and anyone laying out a structure
 * knows a domino's own dimensions.
 */
export function dominoOrientationTooltip(
  command: DominoOrientationCommand,
): string {
  return `${command.label} (${command.shortcutKey})`;
}

/** Which orientation a bare key press chooses, or undefined for any other key. */
export function dominoOrientationForKey(
  key: string,
): DominoOrientation | undefined {
  const upper = key.toUpperCase();
  return DOMINO_ORIENTATION_COMMANDS.find((c) => c.shortcutKey === upper)
    ?.orientation;
}
