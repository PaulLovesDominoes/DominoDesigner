/**
 * Whether the Structure Designer is reachable at all.
 *
 * The screen is still being built, so a published build should be able to hide
 * it completely — no menu entry, no route to it, no help page linked from
 * anywhere. The code still ships in the bundle; only the ways in are removed.
 *
 * Vite replaces `import.meta.env.VITE_*` with a literal string when it builds,
 * so this whole expression folds down to a plain `true` or `false` in the
 * output. Which value it gets comes from the environment file Vite loads for
 * the mode it is running in: `.env.development` for `npm run dev`,
 * `.env.production` for `npm run build`.
 *
 * The comparison is written so that anything other than an explicit "true"
 * leaves the screen hidden — including the variable being absent altogether.
 * That way a build that forgets to set it publishes safely rather than
 * exposing unfinished work.
 */
export const STRUCTURE_DESIGNER_ENABLED =
  import.meta.env.VITE_ENABLE_STRUCTURE_DESIGNER === "true";