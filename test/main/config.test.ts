import { describe, expect, it } from "vitest";

import { buildLauncherEnv } from "../../src/main/services/config";

describe("config service", () => {
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
});
