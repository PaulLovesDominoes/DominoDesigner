/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

// Build-time settings, written in the .env files beside vite.config.ts and
// replaced with literal strings when Vite builds. Declared here so each one is
// named somewhere rather than reaching them all through vite/client's
// catch-all, which types every unknown VITE_ name as `any`.
interface ImportMetaEnv {
  /** "true" makes the Structure Designer reachable. See structure-designer/enabled.ts. */
  readonly VITE_ENABLE_STRUCTURE_DESIGNER?: string;
}