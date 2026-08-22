import type { ScreenId, ToolId } from "../types";

// Map a screen to a specific help topic id (see help/content/*.md). Leave a
// screen out to fall back to the home topic below.
//
// The Structure Designer's page is reachable only from the Structure Designer
// itself, and deliberately isn't linked from the home topic: while the screen
// is hidden by its build flag (structure-designer/enabled.ts) there is no way
// to reach this screen, and so no way to reach its page either.
const SCREEN_TOPIC: Partial<Record<ScreenId, string>> = {
  structureDesigner: "structure-designer",
};

// Map an active tool or mode to a topic. What the user is *doing* is more
// specific than where they are, so these win over SCREEN_TOPIC — without this,
// the title bar's Help button resolves by screen alone and lands on home even
// while a mode with its own page is active. Adding a tool's help page means
// adding an entry here, not editing HelpPanel.
const TOOL_TOPIC: Partial<Record<ToolId, string>> = {
  editDominoes: "domino-editing",
};

export const HOME_TOPIC = "home";

/**
 * The topic to open when the user asks for help without naming one. `activeTool`
 * is only consulted on the designer screen, because a ToolId means nothing
 * anywhere else and the store keeps the last one selected across a screen
 * switch — so without that guard, leaving the designer mid-tool would carry its
 * help page along.
 */
export function topicForContext(screen: ScreenId, activeTool: ToolId): string {
  if (screen === "designer") {
    const byTool = TOOL_TOPIC[activeTool];
    if (byTool) return byTool;
    else return "designer";
  }
  return SCREEN_TOPIC[screen] ?? HOME_TOPIC;
}