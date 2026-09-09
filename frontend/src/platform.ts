/**
 * Which kind of machine the app is running on, and what to call the keys on it.
 *
 * This module imports nothing. That is deliberate and load-bearing: every other
 * file here is free to read it at module scope — a shape's hint string, a
 * swatch's chip label — without any risk of the import-order trap the root
 * CLAUDE.md warns about for `fieldElement`'s geometry.
 *
 * **Why any of this is needed.** Every key and click gesture in the app was
 * designed on Windows, and two of the assumptions behind them are wrong on a
 * Mac:
 *
 *  - **Ctrl+click is macOS's secondary click.** The browser reports it as
 *    `button === 2` with `ctrlKey` set — a right-click — so it can never mean
 *    "add to the selection" there. Worse, Ctrl+drag with one finger is the
 *    *only* right-drag a MacBook trackpad has, which makes it the only way to
 *    pan. So Ctrl has to be left alone on a Mac, and Command takes its place.
 *  - **A MacBook keyboard has no forward Delete and no Page Up/Down.** The key
 *    labelled "delete" sends Backspace. Anything bound to those keys needs a
 *    second binding that exists on every keyboard.
 */

/**
 * The platform string, from whichever source the browser offers.
 *
 * There are two, and they disagree about wording: Chromium's
 * `navigator.userAgentData.platform` says `"macOS"`, while the older
 * `navigator.platform` says `"MacIntel"` (and `"iPhone"`, `"iPad"`, …). Safari
 * has only the second, so both paths are real — testing for one exact string
 * would be wrong for whichever browser reports the other.
 *
 * `userAgentData` is a Chromium-only addition that TypeScript's DOM types don't
 * describe, hence the cast: it says "this object may also carry that property"
 * without claiming every browser has it.
 */
function platformDescription(): string {
  if (typeof navigator === "undefined") return "";
  const withUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return withUserAgentData.userAgentData?.platform ?? navigator.platform ?? "";
}

/**
 * A Mac, iPad or iPhone — whatever the browser. Computed once, at load.
 *
 * This is about the **keyboard and the trackpad**, not about the browser
 * engine, so it is true for Chrome and Firefox on a Mac as well as for Safari.
 * Those two have none of Safari's rendering defects but every one of macOS's
 * input conventions. See IS_WEBKIT for the other question.
 */
export const IS_APPLE = /mac|iphone|ipad|ipod/i.test(platformDescription());

/**
 * How fast the mouse wheel / trackpad zooms the canvases — drei's
 * `<OrbitControls zoomSpeed>`, which scales its fixed ~5%-per-wheel-event dolly
 * step (this version of the control ignores how far the wheel actually turned
 * and only looks at the direction, so this multiplier is the only lever).
 *
 * A Windows mouse wheel sends one event per physical click of the wheel, so the
 * default of 1 is fine there. A Mac trackpad — and a Magic Mouse — sends a long
 * burst of momentum-scroll events for a single small two-finger flick, often
 * dozens of them, and at the default each one compounds on the last: the view
 * shoots from filling the screen to an unfindable speck and back. macOS exposes
 * no setting to calm this, so the app does, with a much smaller per-event step
 * that keeps a whole inertia burst down to a sane amount of zoom.
 */
export const WHEEL_ZOOM_SPEED = IS_APPLE ? 0.4 : 1;

/**
 * Safari, or any browser on iOS/iPadOS.
 *
 * A different question from IS_APPLE, and the two must not be confused. This
 * one asks **which engine is drawing the page**, because some things the app
 * emits — a build plan's exact page size, in particular — are unsupported in
 * Apple's engine and work correctly in Chrome on the very same Mac.
 *
 * `navigator.vendor` is the test because it splits exactly where the engine
 * does: Apple's own value appears in Safari *and* in every browser on iOS and
 * iPadOS (Apple requires them all to use its engine, so "Chrome for iPad" is
 * Safari underneath), while Chrome, Edge and Firefox on macOS report their own
 * vendor and are correctly excluded. It is a non-standard property, which is
 * why the test lives here alone rather than being repeated at a call site.
 */
export const IS_WEBKIT =
  typeof navigator !== "undefined" && navigator.vendor === "Apple Computer, Inc.";

/**
 * What each key is called, by what it *means* rather than by which key it is.
 *
 * Names are semantic on purpose. `add` is "the modifier that adds to a
 * selection", not "Ctrl" — which is what lets the answer differ per platform
 * without every call site knowing that it does. Two consequences:
 *
 *  - **`mod` and `add` give the same answer today and are still separate
 *    entries.** One is the chord modifier (undo, clipboard, select-all), the
 *    other is a pointer gesture's modifier. They happen to coincide; if they
 *    ever stop coinciding, that is one line here rather than a hunt.
 *  - **Some entries are whole gestures rather than keys** — `pan` and `rotate`
 *    are phrases, because what changes between platforms there is the gesture
 *    itself, not the name of a key in it.
 *
 * Single keys use the symbols printed on a Mac keyboard, which is what its
 * menus use and what its users read; the two gesture phrases spell their
 * modifiers out, being prose rather than a key cap.
 *
 * `as const` rather than a plain object: it is what makes KeyName a closed set,
 * so a mistyped token is a compile error instead of `undefined` reaching the
 * screen.
 */
const KEY_LABELS = {
  /** The chord modifier: undo, redo, cut/copy/paste, select all. */
  mod: { windows: "Ctrl", apple: "⌘" },
  /** Held while clicking or dragging, to add to the selection. */
  add: { windows: "Ctrl", apple: "⌘" },
  /** Held while clicking or dragging, to take dominoes back out of it. */
  remove: { windows: "Alt", apple: "⌥" },
  shift: { windows: "Shift", apple: "⇧" },
  /** The same on both, and still a token so the app's casing stays consistent. */
  esc: { windows: "Esc", apple: "Esc" },
  /** Applies the Hide swatch. A MacBook has no forward Delete, so Shift+Backspace. */
  hide: { windows: "DEL", apple: "⇧⌫" },
  /** Applies the Unassigned swatch. */
  unassign: { windows: "Bksp", apple: "⌫" },
  /** Deletes the selected element on the build plane. */
  deleteElement: { windows: "DEL", apple: "⌫" },
  /** Cmd+Y is the browser's own History on a Mac, so redo is named the other way there. */
  redo: { windows: "Ctrl+Y", apple: "⌘⇧Z" },
  /** A MacBook has no Page Up/Down, so the bracket keys stand in. */
  layerUp: { windows: "PgUp", apple: "]" },
  layerDown: { windows: "PgDn", apple: "[" },
  /** Moving the view. A MacBook trackpad's only right-drag is Control plus a drag. */
  pan: { windows: "Right-drag", apple: "Control-drag" },
  rotate: { windows: "Shift+right-drag", apple: "Shift+Control-drag" },
} as const;

export type KeyName = keyof typeof KEY_LABELS;

/**
 * What to call a key on this machine — the one way any user-visible string
 * should name one.
 *
 * Meant to be dropped into an ordinary template literal, so the sentence in the
 * source reads like the sentence on screen:
 * `` `${keyLabel("add")}+drag adds to the selection` ``.
 */
export function keyLabel(name: KeyName): string {
  return IS_APPLE ? KEY_LABELS[name].apple : KEY_LABELS[name].windows;
}

/**
 * Whether a pointer event is asking to *add* to the selection.
 *
 * On Windows either Ctrl or Command does it, exactly as the call sites tested
 * for directly before this existed. On a Mac only Command does, because Ctrl is
 * spoken for: Ctrl+click is the operating system's secondary click, and
 * Ctrl+drag is how a trackpad pans.
 *
 * Note this deliberately answers only half the question. Alt/Option means
 * *remove*, and it is tested before this one at the call site, so holding both
 * removes — see `shape-select/base.ts`'s SelectionGestureMode.
 */
export function isAddModifier(event: {
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return IS_APPLE ? event.metaKey : event.ctrlKey || event.metaKey;
}

/** Matches a `{{token}}` placeholder in help content. */
const KEY_TOKEN = /\{\{(\w+)\}\}/g;

/**
 * Matches a `{{#apple}}…{{/apple}}` block, or the `windows` equivalent.
 *
 * `[\s\S]` rather than `.` so a block may span lines — most of them wrap a whole
 * paragraph or section. The `*?` is non-greedy and the `\1` backreference makes
 * the closing marker match its own opening one, so two blocks in a row stay two
 * blocks instead of merging into one that swallows the text between them.
 */
const CONDITIONAL_BLOCK = /\{\{#(apple|windows)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

/** A marker left over after the pass above — an unclosed or misspelt block. */
const STRAY_MARKER = /\{\{[#/][^}]*\}\}/;

/**
 * Prepares help topic text for the machine it is being read on: drops the
 * passages meant for the other kind, then fills in key names.
 *
 * ## Conditional blocks
 *
 * `{{#apple}}…{{/apple}}` keeps its contents only on a Mac, iPad or iPhone, and
 * `{{#windows}}…{{/windows}}` only everywhere else. (`windows` is the same
 * slightly-loose name the label table uses for "not Apple", kept the same in
 * both places rather than being right in one and surprising in the other.)
 *
 * They exist because **some differences are not just a key's name**. A key name
 * a token can swap; a paragraph explaining that Control is left alone for
 * panning is simply irrelevant to a Windows reader, and printing it to everyone
 * makes the page read as though the Mac were an afterthought bolted on at the
 * end — which is the impression the whole change exists to avoid. Reach for a
 * `{{token}}` first and a block only when the *prose* differs.
 *
 * They work inline as well as around whole sections, so a single trailing
 * clause is as easy as a heading and three paragraphs.
 *
 * ## When something is wrong
 *
 * **Anything unrecognised is left exactly as written**, never blanked: a
 * visible `{{addd}}` or `{{#appel}}` on the page is how a mistake gets noticed,
 * where a silent gap is not. Since a stray marker's `#` and `/` are not word
 * characters, it cannot be mistaken for a key token either. The warnings run
 * only during development — `import.meta.env.DEV` becomes a literal `false` in a
 * production build, so the branches fold away entirely.
 */
export function resolvePlatformText(text: string): string {
  const forThisMachine = text.replace(
    CONDITIONAL_BLOCK,
    (_whole, platform: string, body: string) =>
      (platform === "apple") === IS_APPLE ? body : "",
  );

  if (import.meta.env.DEV) {
    const stray = STRAY_MARKER.exec(forThisMachine);
    if (stray) {
      console.warn(
        `Help content has an unclosed or misspelt conditional block: ${stray[0]}`,
      );
    }
  }

  return forThisMachine.replace(KEY_TOKEN, (whole, name: string) => {
    if (name in KEY_LABELS) return keyLabel(name as KeyName);
    if (import.meta.env.DEV) {
      console.warn(`Help content uses an unknown key token: ${whole}`);
    }
    return whole;
  });
}
