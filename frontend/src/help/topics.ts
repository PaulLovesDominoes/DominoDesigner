import { resolvePlatformText } from "../platform";

const rawModules = import.meta.glob("./content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface HelpTopic {
  id: string;
  title: string;
  body: string;
}

function topicIdFromPath(path: string): string {
  return path.replace(/^.*\//, "").replace(/\.md$/, "");
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

/**
 * Every topic, keyed by id, already resolved for the machine it will be read on
 * — the passages meant for a different kind of machine dropped, and the key
 * names filled in.
 *
 * That happens **here**, once, rather than in `HelpPanel` when a page is shown:
 * `body` is then simply the text, and nothing downstream has to remember to run
 * it. It also means a topic and the hint bar beside it read their key names from
 * the same table in `platform.ts`, so the two can never come to disagree about
 * what a shortcut is called — which they previously did, there being no shared
 * source at all.
 *
 * The title is still taken from the *raw* body. Headings carry neither key names
 * nor conditional blocks, and doing it in this order keeps the two steps
 * independent.
 */
export const HELP_TOPICS: Record<string, HelpTopic> = Object.fromEntries(
  Object.entries(rawModules).map(([path, raw]) => {
    const id = topicIdFromPath(path);
    return [id, { id, title: titleFromMarkdown(raw, id), body: resolvePlatformText(raw) }];
  }),
);
