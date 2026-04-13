// @vitest-environment node

import { describe, expect, it } from "vitest";

import { getPreloadPath, resolveRendererEntry } from "../../src/main/windowEntry";

describe("main window entry helpers", () => {
  it("uses the dev server URL when ELECTRON_RENDERER_URL is provided", () => {
    expect(
      resolveRendererEntry("/app/root", {
        ELECTRON_RENDERER_URL: "http://127.0.0.1:5173"
      })
    ).toEqual({
      target: "http://127.0.0.1:5173",
      type: "url"
    });
  });

  it("falls back to the built renderer file when no dev server URL is set", () => {
    expect(resolveRendererEntry("/app/root", {})).toEqual({
      target: "/app/root/dist-renderer/index.html",
      type: "file"
    });
  });

  it("always resolves the preload bundle from the built main output", () => {
    expect(getPreloadPath("/app/root")).toBe("/app/root/dist-electron/main/preload.js");
  });
});
