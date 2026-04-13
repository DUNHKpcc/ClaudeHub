// @vitest-environment node

import { describe, expect, it } from "vitest";

import viteMainConfig from "../../vite.main.config";

describe("vite main config", () => {
  it("builds preload as cjs so Electron can load it as a preload script", () => {
    const config =
      typeof viteMainConfig === "function"
        ? viteMainConfig({
            mode: "electron-preload",
            command: "build",
            isSsrBuild: false,
            isPreview: false
          })
        : viteMainConfig;

    const lib = config.build?.lib && !Array.isArray(config.build.lib) ? config.build.lib : null;
    const fileName =
      typeof lib?.fileName === "function" ? lib.fileName("cjs", "preload") : lib?.fileName ?? "";

    expect(lib?.formats ?? []).toEqual(["cjs"]);
    expect(fileName).toBe("preload.js");
  });
});
