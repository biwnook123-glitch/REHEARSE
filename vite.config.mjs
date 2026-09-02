import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    // File parsers are lazy-loaded only when their format is imported. Their
    // standalone chunks are intentionally larger than the default 500 kB
    // warning threshold and do not inflate the initial application bundle.
    chunkSizeWarningLimit: 550,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
