import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build:preview` makes one self-contained HTML file for the hosted preview.
export default defineConfig(({ mode }) => ({
  plugins: mode === "preview-single" ? [react(), viteSingleFile()] : [react()],
  // Phaser (~1MB) is lazy-loaded only when a concert starts.
  // The normal build has two pages: the game (index.html) and the tourstarapp.com splash page (landing.html).
  build: mode === "preview-single"
    ? { outDir: "dist-preview", chunkSizeWarningLimit: 2000 }
    : { chunkSizeWarningLimit: 2000, rollupOptions: { input: { main: "index.html", landing: "landing.html", privacy: "privacy.html", terms: "terms.html", support: "support.html" } } },
}));
