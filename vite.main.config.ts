import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const external = [
  "electron",
  "node:path",
  "node:os",
  "node:fs",
  "node:fs/promises",
  "node:child_process",
  "node:util"
];

export default defineConfig(({ mode }) => {
  const isPreloadBuild = mode === "electron-preload";

  return {
    build: {
      outDir: "dist-electron/main",
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, isPreloadBuild ? "src/main/preload.ts" : "src/main/index.ts"),
        formats: [isPreloadBuild ? "cjs" : "es"],
        fileName: () => (isPreloadBuild ? "preload.js" : "index.js")
      },
      rollupOptions: {
        external
      }
    }
  };
});
