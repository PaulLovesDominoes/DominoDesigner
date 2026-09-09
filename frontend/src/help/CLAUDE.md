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

**Never write a key name into a topic.** Write `{{add}}`, `{{esc}}`, `{{hide}}` and so on;
`topics.ts` resolves them through `platform.ts` as it loads, so a topic names keys the way the
reader's own machine does and can never disagree with the hint bar or a tooltip about what a
shortcut is called. The token names say what a key *means*, not which key it is — that table is the
list of them.

**Where the prose itself differs, wrap it**: `{{#apple}}…{{/apple}}` appears only on a Mac, iPad or
iPhone, `{{#windows}}…{{/windows}}` only everywhere else. Both work inline and around whole
sections. Reach for a token first and a block only when a token cannot carry it — a passage
explaining *why* Control is left alone for panning has no Windows reader, and a topic that spells
out Ctrl throughout and then apologises for the Mac at the bottom reads as though one platform were
an afterthought. That impression is the thing these exist to avoid, so prefer writing each reader
one page that is simply about their machine.

Anything unrecognised — an unknown token, an unclosed or misspelt block — is left on the page
verbatim, with a warning in the console during development, so a mistake shows up rather than
silently blanking.

The topics themselves are otherwise ordinary prose, but two conventions have settled in and are
worth keeping: a topic other than `home` opens with a breadcrumb line of links back up
(`[Home](home) > Build Designer`), and links between topics are written as bare topic ids —
though a `.md` suffix works too, since `HelpPanel` strips it before looking the topic up.
`HelpPanel.module.css` zeroes the margins on a `<p>` inside an `<li>`, because Markdown wraps
every item of a list in a paragraph as soon as any two of its items are separated by a blank
line, which would otherwise put a gap under every bullet in that list. That is a fix for how
people naturally write Markdown, not for one topic's formatting — don't ask help authors to
close up their lists instead.