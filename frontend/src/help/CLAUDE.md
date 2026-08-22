### Help system

`help/topics.ts` auto-discovers `help/content/*.md` via `import.meta.glob(..., eager: true)`,
deriving each topic's id from the filename and its title from the first `#` heading. Adding a
help topic means adding a markdown file — no registration needed.

**Which topic opens is resolved two ways, and both matter.** A caller can name one outright
(`openHelpTopic(id)` → `helpTopicOverride`, which is what `ModeHintBar`'s in-mode Help button
uses); otherwise — notably the title bar's Help button, which names nothing —
`help/registry.ts`'s `topicForContext(screen, activeTool)` picks the contextual default. It
consults `TOOL_TOPIC` before `SCREEN_TOPIC` because what the user is *doing* is more specific
than where they are: keyed on screen alone, opening help inside domino editing mode landed on
`home`, since `SCREEN_TOPIC` is empty. `activeTool` is only consulted on the designer screen —
a `ToolId` means nothing elsewhere, and the store keeps the last one selected across a screen
switch, so without that guard leaving the designer mid-tool would carry its help page along.
On the designer screen with no tool-specific topic, it returns `designer` **directly rather than
through `SCREEN_TOPIC`** — so a `designer` entry added to that map would never be read. If a
second screen ever wants a default page, move this one into `SCREEN_TOPIC` rather than adding a
second hard-coded return.

The topics themselves are ordinary prose, but two conventions have settled in and are worth
keeping: a topic other than `home` opens with a breadcrumb line of links back up
(`[Home](home) > Build Designer`), and links between topics are written as bare topic ids —
though a `.md` suffix works too, since `HelpPanel` strips it before looking the topic up.
`HelpPanel.module.css` zeroes the margins on a `<p>` inside an `<li>`, because Markdown wraps
every item of a list in a paragraph as soon as any two of its items are separated by a blank
line, which would otherwise put a gap under every bullet in that list. That is a fix for how
people naturally write Markdown, not for one topic's formatting — don't ask help authors to
close up their lists instead.