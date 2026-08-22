### Hand-drawn icons

Remixicon has no glyph for most of the shape-select gestures, and a drawing of the gesture itself
turned out to say more than any stock icon anyway. `src/icons/` holds the ones drawn by hand
(PowerPoint → *Save as Picture* → SVG, sources kept in `src/assets/`).

- **`createSvgIcon(Svg, viewBox)`** adapts what `vite-plugin-svgr` produces — a component taking
  raw SVG attributes — into the `size`/`color` contract the app passes icons around by. It puts
  `fill={color}` on the `<svg>` and nothing on the paths, which is the whole mechanism: `fill` is
  inherited, so an icon follows a button's four colour states exactly as a Remixicon one does. An
  exported path carrying its own `fill` would freeze one colour and stop matching its neighbours.
- **`viewBox` is required, and `paddedViewBox(width, height)` is how to supply it.** PowerPoint
  writes `width`/`height` and no viewBox, which pins a drawing to one size; nothing upstream fills
  that in, because the svgr plugin runs no SVGO (see `vite.config.ts`). The padding matters too — a
  drawing filling its own box reads visibly heavier than a Remixicon glyph, which leaves a margin.
- **`src/icons/index.tsx` is the one barrel file in `src`.** It earns the exception because icons
  import nothing from the app, so it cannot join an import cycle. Not a licence for barrels
  elsewhere.
- **The two numbers passed to `paddedViewBox` must match the `width`/`height` on the first line of
  the `.svg`, and nothing checks it.** TypeScript cannot see inside the file and the build passes
  either way; the only symptom is an icon sitting slightly off-centre or at the wrong size. This
  has already drifted once. Re-check line 1 after every re-export.
- **A *family* of icons whose relative sizes matter breaks that rule on purpose, and shares one
  viewBox.** The six paint-brush size glyphs (`PAINT_BRUSH_VIEW_BOX`) are all
  `paddedViewBox(828, 826)` — the largest of them — rather than each file's own numbers, and the
  comment there says so because the next reader will otherwise "fix" it back. Two things make it
  necessary. Per-file boxes *normalise* the drawings, so the nib would grow far less than it should
  while the shared droplet in every one of them visibly **shrank** as the size went up, partly
  inverting the cue. And a shared box that *centred* each drawing would fix the scale but move the
  droplet, because these drawings are anchored at their origin rather than their centre — only one
  identical viewBox string holds it still. The rule generalises: **the exception applies whenever
  several drawings must be compared to each other, and then all of them must share the box.**
  Note the glyphs are indicative, not to scale — drawn at the true millimetre ratios a Small nib
  would be nearly invisible at 20px, so don't "correct" them to match.
- **Id collisions are handled, by SVGO's `prefixIds` — don't remove it.** PowerPoint emits ids for
  gradients, picture fills, shadows and clipping, numbered from zero *within each file*, so almost
  every export that has one calls it `clip0`; an inlined icon's ids then belong to the whole page
  rather than to its own file. Two drawings both carrying `clip0` put two `<clipPath id="clip0">`
  into one document, every `url(#clip0)` resolves to whichever came first in DOM order, and one
  icon is clipped by the other's rectangle. `vite.config.ts` therefore runs `@svgr/plugin-svgo`
  ahead of `@svgr/plugin-jsx` with `["preset-default", "prefixIds"]`, which renames each id to
  `<Filename>_svg__a`. This stopped being hypothetical the moment the six `Paint-Circle-*` /
  `Paint-Quill-*` exports landed — every one of them carries a clip path. Two traps recorded in
  full at that config: `preset-default` alone does **not** fix it (its `cleanupIds` only shortens
  ids within one file, so two files both end up with an id named `a`), and there is deliberately
  **no top-level `svgo` dependency**, because `@svgr/plugin-svgo` pins svgo 3.x itself and adding
  svgo would only install an unused 4.x alongside it.