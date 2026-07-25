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

export const HELP_TOPICS: Record<string, HelpTopic> = Object.fromEntries(
  Object.entries(rawModules).map(([path, body]) => {
    const id = topicIdFromPath(path);
    return [id, { id, title: titleFromMarkdown(body, id), body }];
  }),
);
