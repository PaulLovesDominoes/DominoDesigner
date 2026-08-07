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
    // Deliberately unconfigured. Note this plugin does NOT run SVGO — it
    // enables @svgr/plugin-jsx only, so an `svgoConfig` here is silently
    // ignored (svgo isn't even installed). That matters for two things:
    //
    //   - A PowerPoint export has width/height and no viewBox, and nothing in
    //     this pipeline adds one. createSvgIcon therefore requires a viewBox
    //     from every icon, which is also where the sizing margin comes from.
    //   - Cruft in an export survives into the bundle. Ids are the part worth
    //     watching: PowerPoint emits them for gradients and clipPaths, numbered
    //     from zero within each file, and an inlined icon's ids belong to the
    //     whole page rather than to its own file. Two drawings both carrying
    //     `clip0` therefore collide, and one gets clipped by the other's
    //     rectangle. Only Circle-by-Radius.svg has one today, so nothing
    //     collides yet.
    //
    //     The fix, when a second one turns up:
    //       npm i -D svgo @svgr/plugin-svgo
    //       svgrOptions: {
    //         plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
    //         svgoConfig: { plugins: ["preset-default", "prefixIds"] },
    //       }
    //     Note it is `prefixIds` that does the work, by putting the file's name
    //     in front of each id. The default preset alone will NOT fix this: its
    //     cleanupIds only shortens ids within one file, so two files would
    //     both end up with an id named `a` and collide just the same.
    svgr(),
  ],
  build: {
    outDir: "dist",
  },
});
