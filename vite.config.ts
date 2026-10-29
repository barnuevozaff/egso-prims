import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Surfaced read-only in Settings → System Information.
  define: {
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // The dev server's file watcher holds handles on what it watches, and on
    // Windows that stops the emulators from saving their data
    // (emulator-data/, written through a firebase-export-* folder).
    watch: { ignored: ["**/emulator-data/**", "**/firebase-export-*/**"] },
  },
  build: {
    // Vite's default CSS target is Chrome 111, the first to read oklch(), so
    // every Tailwind colour ships without a fallback. Office PCs on Windows 7
    // and 8.1 cannot update past Chrome/Edge 109 and render the whole admin
    // colourless, with black borders. Naming 109 makes Lightning CSS emit a
    // hex value first and keep oklch/lab for browsers that support it.
    cssTarget: ["chrome109", "edge109", "firefox114", "safari16.4", "ios16.4"],
  },
});
