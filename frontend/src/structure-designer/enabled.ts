/**
 * Whether the Structure Designer is reachable at all.
 *
 * The screen is still being built, so a published build should be able to hide
 * it completely — no menu entry, no route to it, no help page linked from
 * anywhere.
 *
 * Vite replaces `import.meta.env.VITE_*` with a literal string when it builds,
 * so this whole expression folds down to a plain `true` or `false` in the
 * output. Which value it gets comes from the environment file Vite loads for
 * the mode it is running in: `.env.development` for `npm run dev`,
 * `.env.production` for `npm run build`.
 *
 * **Most of the screen is then dropped from the bundle, not merely hidden.**
 * With the constant folded to `false`, `App.tsx`'s conditional entry for the
 * screen is gone, nothing refers to `StructureDesignerScreen` any more, and the
 * bundler removes every module reachable only through it — the canvas, the
 * tools, the drawing. **`StructureToolbar` is the exception**, because
 * `components/TitleBar.tsx` picks between the two toolbars at run time and so
 * imports this one whatever the flag says; that keeps the toolbar and whatever
 * it reaches (the store, the operation registry) in the bundle as dead weight.
 *
 * The consequence to know about: **a production build is not a check on this
 * screen's code.** `npm run build` type-checks the whole program first, so
 * types are still checked — but the bundling half compiles most of this folder
 * to nothing, and its output can be byte-for-byte identical across a real
 * change made in here. Exercise the screen under `npm run dev`, where the flag
 * is on, and do not read a build as having verified it.
 *
 * The comparison is written so that anything other than an explicit "true"
 * leaves the screen hidden — including the variable being absent altogether.
 * That way a build that forgets to set it publishes safely rather than
 * exposing unfinished work.
 */
export const STRUCTURE_DESIGNER_ENABLED =
  import.meta.env.VITE_ENABLE_STRUCTURE_DESIGNER === "true";