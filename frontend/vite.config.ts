import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// Built assets are served from the FastAPI app at the site root, so the
// default base ("/") is correct. dist/ is what server/main.py serves.
export default defineConfig({
  plugins: [
    react(),
    // Lets `import Something from "./x.svg?react"` hand back a React component
    // that draws the file's contents inline, instead of a URL pointing at it.
    // Inline is what custom toolbar icons need: an <img> can't inherit the
    // button's text colour, where an inline <svg> can (see
    // icons/createSvgIcon.tsx).
    //
    // The ?react suffix is required, so an .svg imported without it still
    // resolves to a plain URL as it always did — which is what src/assets'
    // logos rely on.
    //
    // SVGO runs ahead of the JSX conversion, and `prefixIds` is the whole reason
    // it is here. The plugin list has to be spelled out in full: naming
    // @svgr/plugin-svgo replaces the default list rather than adding to it, so
    // dropping @svgr/plugin-jsx would leave the import handing back raw SVG
    // instead of a component.
    //
    // **What prefixIds fixes.** PowerPoint emits ids for gradients and
    // clipPaths, numbered from zero *within each file* — so almost every export
    // that has one calls it `clip0`. An inlined icon's ids belong to the whole
    // page rather than to its own file, so two drawings both carrying `clip0`
    // put two `<clipPath id="clip0">` into one document; every `url(#clip0)`
    // then resolves to whichever came first in DOM order, and one icon gets
    // clipped by the other's rectangle. prefixIds puts the file's name in front
    // of each id, which is what keeps them apart.
    //
    // `preset-default` alone does NOT fix it, and this is the easy mistake to
    // make: its cleanupIds only shortens ids within one file, so two files would
    // both end up with an id named `a` and collide exactly the same way.
    //
    // Two things to know about turning SVGO on here:
    //
    //   - `preset-default` includes removeViewBox. Harmless, because
    //     createSvgIcon passes viewBox as a prop that overrides whatever the
    //     file declares — and a PowerPoint export has width/height and no
    //     viewBox to begin with, which is why createSvgIcon requires one from
    //     every icon and where the sizing margin comes from.
    //   - There is deliberately no top-level `svgo` dependency.
    //     @svgr/plugin-svgo pins svgo ^3.0.2 as a direct dependency and uses
    //     that nested copy, so installing svgo alongside it only adds a second,
    //     unused version — and npm now resolves that to svgo 4, whose plugin
    //     names and preset behaviour differ from the 3.x this config is written
    //     against. Adding it would be a trap for the next reader, not a
    //     safeguard.
    svgr({
      svgrOptions: {
        plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
        svgoConfig: { plugins: ["preset-default", "prefixIds"] },
      },
    }),
  ],
  build: {
    outDir: "dist",
    // Without this a production build reports errors against minified bundle
    // offsets — `index-HMCDrBOU.js:1:48213` — which say nothing about the code
    // that caused them. With it the browser maps a stack back to the real file
    // and line in src/, so a bug found while running the built app through the
    // FastAPI server is as easy to place as one found under `npm run dev`.
    //
    // The .map files sit beside the bundle in dist/ and are only fetched when
    // devtools is open, so this costs nothing at runtime. It does publish the
    // source to anyone who looks; `"hidden"` would emit the maps without the
    // comment pointing at them, which is the choice to make if that ever
    // matters. It does not today — this is a local tool.
    sourcemap: true,
  },
});
