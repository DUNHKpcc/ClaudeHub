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

    expect(config.build?.lib && !Array.isArray(config.build.lib) ? config.build.lib.formats : []).toEqual(["cjs"]);
    expect(config.build?.lib && !Array.isArray(config.build.lib) ? config.build.lib.fileName?.("cjs", "preload") : "").toBe(
      "preload.js"
    );
  });
});
