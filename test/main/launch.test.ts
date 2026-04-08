import { EventEmitter } from "node:events";

import { describe, expect, it, vi, beforeEach } from "vitest";

const { spawnMock, readConfigMock, buildLauncherEnvMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  readConfigMock: vi.fn(),
  buildLauncherEnvMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock
  }
}));

vi.mock("../../src/main/services/config", () => ({
  readConfig: readConfigMock,
  buildLauncherEnv: buildLauncherEnvMock
}));

import { launchClaudeCode } from "../../src/main/services/launch";

class MockChildProcess extends EventEmitter {
  pid?: number;
}

describe("launch service", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    readConfigMock.mockReset();
    buildLauncherEnvMock.mockReset();

    readConfigMock.mockResolvedValue({
      apiKey: "test-key",
      baseUrl: "https://example.com",
      model: "claude-sonnet-4"
    });
    buildLauncherEnvMock.mockReturnValue({ ANTHROPIC_API_KEY: "test-key" });
  });

  it("waits for the spawn event before resolving with the pid", async () => {
    const child = new MockChildProcess();
    child.pid = 1234;
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode();
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);

    child.emit("spawn");

    await expect(resultPromise).resolves.toBe(1234);
  });

  it("rejects if the child emits an error before spawning", async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode();
    const spawnError = new Error("spawn failed");

    await Promise.resolve();

    child.emit("error", spawnError);

    await expect(resultPromise).rejects.toThrow("spawn failed");
  });
});
