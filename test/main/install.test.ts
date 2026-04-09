import { EventEmitter } from "node:events";

import { describe, expect, it, vi, beforeEach } from "vitest";

const { spawnMock, platformMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  platformMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock
  }
}));

vi.mock("node:os", () => ({
  default: {
    platform: platformMock
  },
  platform: platformMock
}));

import { buildInstallPlan } from "../../src/main/services/install";
import { runInstallPlan } from "../../src/main/services/install";

class MockChildProcess extends EventEmitter {
  pid?: number;
}

describe("install service", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    platformMock.mockReset();
  });

  it("builds an install plan from missing and outdated dependencies", () => {
    expect(
      buildInstallPlan([
        { name: "node", state: "missing" },
        { name: "npm", state: "installed" },
        { name: "git", state: "outdated" },
        { name: "claude", state: "installed" }
      ])
    ).toEqual(["node", "git"]);
  });

  it("does not schedule node installation when only npm is missing", () => {
    expect(
      buildInstallPlan([
        { name: "node", state: "installed" },
        { name: "npm", state: "missing" },
        { name: "git", state: "installed" },
        { name: "claude", state: "installed" }
      ])
    ).toEqual([]);
  });

  it("returns success with no steps when the install plan is empty", async () => {
    await expect(runInstallPlan([])).resolves.toEqual({
      ok: true,
      steps: []
    });
  });

  it("runs the Claude installer command on macOS and resolves with a completed Claude step", async () => {
    platformMock.mockReturnValue("darwin");

    const child = new MockChildProcess();
    child.pid = 4321;
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["claude"]);
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);
    expect(spawnMock).toHaveBeenCalledWith("bash", ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"], {
      stdio: "inherit"
    });

    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      steps: [{ name: "claude", state: "completed" }]
    });
  });

  it("runs the Claude installer command on Windows PowerShell", async () => {
    platformMock.mockReturnValue("win32");

    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["claude"]);

    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      "powershell",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://claude.ai/install.ps1 | iex"
      ],
      { stdio: "inherit" }
    );

    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      steps: [{ name: "claude", state: "completed" }]
    });
  });

  it("marks unsupported dependency installs as failed manual steps", async () => {
    platformMock.mockReturnValue("darwin");

    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["git", "claude"]);

    await Promise.resolve();
    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      steps: [
        {
          name: "git",
          state: "failed",
          message: "Manual install required for git."
        },
        {
          name: "claude",
          state: "completed"
        }
      ]
    });
  });
});
