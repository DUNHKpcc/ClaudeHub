import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist-electron/main",
    emptyOutDir: false,
    lib: {
      entry: {
        index: path.resolve(rootDir, "src/main/index.ts"),
        preload: path.resolve(rootDir, "src/main/preload.ts")
      },
      formats: ["es"]
    },
    rollupOptions: {
      external: ["electron", "node:path", "node:os", "node:fs", "node:child_process"]
    }
  }
});
