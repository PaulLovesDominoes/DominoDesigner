import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built assets are served from the FastAPI app at the site root, so the
// default base ("/") is correct. dist/ is what server/main.py serves.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
  },
});
