import { RiAddBoxLine, RiCrop2Line } from "@remixicon/react";
import type { RemixiconComponentType } from "@remixicon/react";

/**
 * What a left-drag on the canvas does, offered to the user: its glyph, its name,
 * and the key that chooses it.
 *
 * **One table, read by both the toolbar and the hint bar**, so the pressed button
 * and the bar saying which is pressed cannot disagree. Same arrangement as
 * dominoOrientationCommands.ts next door, and for the same reason.
 *
 * ## There are modes now, and there deliberately were not before
 *
 * This screen's first release put dominoes down at any time and had no tool at
 * all: the three orientation buttons chose only *which way up*, and the left
 * button was always a placement. That was right while placing was the only thing
 * the canvas could do. Selecting dominoes needs a rubber band, a rubber band
 * needs the left button, and the left button was taken — so the two are modes and
 * one of them is always on.
 *
 * The orientation buttons stay what they were: not a mode, but a setting the
 * placement mode reads. Two things can be chosen at once here because they answer
 * different questions.
 */

/** What a left-drag on the canvas does. */
export type StructureTool = "createDominoes" | "rectangleSelect";

export interface StructureToolCommand {
  tool: StructureTool;
  icon: RemixiconComponentType;
  /** How the tool is named in the hint bar and in a button's tooltip. */
  label: string;
  /** The key that chooses it, as it is shown to the user. */
  shortcutKey: string;
}

/**
 * Placement first, since it is the mode the screen starts in and the one most of
 * a session is spent in.
 *
 * Both glyphs are Remixicon's and stand in until drawings of these two gestures
 * exist, the way RiEyeOffLine stood in for hiding the layers above.
 */
export const STRUCTURE_TOOL_COMMANDS: readonly StructureToolCommand[] = [
  {
    tool: "createDominoes",
    icon: RiAddBoxLine,
    label: "Domino Creation",
    shortcutKey: "Esc",
  },
  {
    tool: "rectangleSelect",
    icon: RiCrop2Line,
    label: "Rectangular Select",
    shortcutKey: "R",
  },
];

/** The entry for one tool. Every tool has one. */
export function structureToolCommand(tool: StructureTool): StructureToolCommand {
  // The table covers both, so the fallback is only here to keep the return type
  // free of undefined; it is not reachable.
  return (
    STRUCTURE_TOOL_COMMANDS.find((c) => c.tool === tool) ??
    STRUCTURE_TOOL_COMMANDS[0]
  );
}

/** A button's tooltip, e.g. "Rectangular Select (R)". */
export function structureToolTooltip(command: StructureToolCommand): string {
  return `${command.label} (${command.shortcutKey})`;
}

/**
 * Which tool a bare letter chooses, or undefined for any other key.
 *
 * **Single letters only, which is why Escape is not found here** even though it
 * is the shortcut printed against Domino Creation. Escape has to cancel a drag
 * in progress before it does anything else, and only the tool running that drag
 * knows whether there is one — so each tool handles its own Escape and the
 * screen's keyboard handler never sees it. See DominoSelectTool.
 */
export function structureToolForKey(key: string): StructureTool | undefined {
  if (key.length !== 1) return undefined;
  const upper = key.toUpperCase();
  return STRUCTURE_TOOL_COMMANDS.find((c) => c.shortcutKey === upper)?.tool;
}