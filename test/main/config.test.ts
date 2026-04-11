import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildLauncherEnv, readConfigPlaceholders, saveConfig } from "../../src/main/services/config";

describe("config service", () => {
  afterEach(async () => {
    await fs.rm(path.join(os.tmpdir(), "pclaude-config-tests"), { recursive: true, force: true });
  });

  it("maps launcher config values into Claude environment variables", () => {
    expect(
      buildLauncherEnv({
        apiKey: "test-key",
        baseUrl: "https://example.com",
        model: "claude-sonnet-4"
      })
    ).toMatchObject({
      ANTHROPIC_API_KEY: "test-key",
      ANTHROPIC_BASE_URL: "https://example.com",
      ANTHROPIC_MODEL: "claude-sonnet-4"
    });
  });

  it("reads placeholder values from Claude settings env", async () => {
    const homeDir = path.join(os.tmpdir(), "pclaude-config-tests", "settings-home");
    const settingsDir = path.join(homeDir, ".claude");
    await fs.mkdir(settingsDir, { recursive: true });
    await fs.writeFile(
      path.join(settingsDir, "settings.json"),
      `${JSON.stringify(
        {
          env: {
            ANTHROPIC_AUTH_TOKEN: "cr_test_token",
            ANTHROPIC_BASE_URL: "https://proxy.example.com",
            ANTHROPIC_MODEL: "claude-haiku-4-5-20251001"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    await expect(readConfigPlaceholders({ homeDir })).resolves.toEqual({
      apiKey: "cr_test_token",
      baseUrl: "https://proxy.example.com",
      model: "claude-haiku-4-5-20251001"
    });
  });

  it("falls back to the saved app config when Claude settings are missing", async () => {
    const homeDir = path.join(os.tmpdir(), "pclaude-config-tests", "fallback-home");
    await saveConfig(
      {
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514"
      },
      { homeDir }
    );

    await expect(readConfigPlaceholders({ homeDir })).resolves.toEqual({
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-20250514"
    });
  });
});
