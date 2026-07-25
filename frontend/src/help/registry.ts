import type { ScreenId } from "../types";

// Map a screen to a specific help topic id (see help/content/*.md). Leave a
// screen out to fall back to the home topic below.
const SCREEN_TOPIC: Partial<Record<ScreenId, string>> = {};

export const HOME_TOPIC = "home";

export function topicForScreen(screen: ScreenId): string {
  return SCREEN_TOPIC[screen] ?? HOME_TOPIC;
}
