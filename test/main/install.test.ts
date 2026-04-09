import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  spawnMock,
  platformMock,
  archMock,
  tmpdirMock,
  mkdirMock,
  writeFileMock,
  rmMock,
  detectEnvironmentMock
} = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  platformMock: vi.fn(),
  archMock: vi.fn(),
  tmpdirMock: vi.fn(),
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
  rmMock: vi.fn(),
  detectEnvironmentMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock
  }
}));

vi.mock("node:os", () => ({
  default: {
    platform: platformMock,
    arch: archMock,
    tmpdir: tmpdirMock
  },
  platform: platformMock,
  arch: archMock,
  tmpdir: tmpdirMock
}));

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: mkdirMock,
    rm: rmMock,
    writeFile: writeFileMock
  },
  mkdir: mkdirMock,
  rm: rmMock,
  writeFile: writeFileMock
}));

vi.mock("../../src/main/services/environment", () => ({
  detectEnvironment: detectEnvironmentMock
}));

import { buildInstallPlan, runInstallPlan } from "../../src/main/services/install";

class MockChildProcess extends EventEmitter {
  pid?: number;
}

function createFetchResponse(body = "binary") {
  return {
    ok: true,
    status: 200,
    arrayBuffer: vi.fn().mockResolvedValue(Buffer.from(body).buffer)
  };
}

describe("install service", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    platformMock.mockReset();
    archMock.mockReset();
    tmpdirMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockReset();
    rmMock.mockReset();
    detectEnvironmentMock.mockReset();

    platformMock.mockReturnValue("darwin");
    archMock.mockReturnValue("arm64");
    tmpdirMock.mockReturnValue("/tmp");
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    rmMock.mockResolvedValue(undefined);
    detectEnvironmentMock.mockResolvedValue({
      dependencies: [
        { name: "node", state: "installed", version: "22.22.2", path: "/usr/bin/node" },
        { name: "npm", state: "installed", version: "10.9.0", path: "/usr/bin/npm" },
        { name: "git", state: "installed", version: "2.53.0", path: "/usr/bin/git" },
        { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
      ],
      platform: "darwin",
      arch: "arm64"
    });
    vi.stubGlobal("fetch", vi.fn());
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

  it("schedules node installation when npm is missing", () => {
    expect(
      buildInstallPlan([
        { name: "node", state: "installed" },
        { name: "npm", state: "missing" },
        { name: "git", state: "installed" },
        { name: "claude", state: "installed" }
      ])
    ).toEqual(["node"]);
  });

  it("returns success with no steps when the install plan is empty", async () => {
    await expect(runInstallPlan([])).resolves.toEqual({
      ok: true,
      steps: []
    });
  });

  it("downloads the official Node installer on Windows and installs it silently", async () => {
    platformMock.mockReturnValue("win32");
    archMock.mockReturnValue("x64");
    (globalThis.fetch as any).mockResolvedValue(createFetchResponse("node-msi"));

    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["node"]);

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://nodejs.org/download/release/v22.22.2/node-v22.22.2-x64.msi"
      );
    });

    expect(writeFileMock).toHaveBeenCalledWith(
      "/tmp/pclaude-installer/node-v22.22.2-x64.msi",
      expect.any(Buffer)
    );
    expect(spawnMock).toHaveBeenCalledWith(
      "msiexec.exe",
      ["/i", "/tmp/pclaude-installer/node-v22.22.2-x64.msi", "/qn", "/norestart"],
      { stdio: "inherit" }
    );

    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      steps: [
        {
          name: "node",
          state: "completed",
          message: "Installed node from the official source."
        }
      ]
    });
  });

  it("falls back to the Ali mirror when the official Node download fails", async () => {
    platformMock.mockReturnValue("win32");
    archMock.mockReturnValue("x64");
    (globalThis.fetch as any)
      .mockRejectedValueOnce(new Error("official failed"))
      .mockResolvedValueOnce(createFetchResponse("node-msi"));

    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["node"]);

    await vi.waitFor(() => {
      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        2,
        "https://npmmirror.com/mirrors/node/v22.22.2/node-v22.22.2-x64.msi"
      );
    });

    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      1,
      "https://nodejs.org/download/release/v22.22.2/node-v22.22.2-x64.msi"
    );

    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      steps: [
        {
          name: "node",
          state: "completed",
          message: "Installed node using the Ali mirror fallback."
        }
      ]
    });
  });

  it("uses winget to install Git on Windows when available", async () => {
    platformMock.mockReturnValue("win32");
    archMock.mockReturnValue("x64");

    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["git"]);

    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      "winget",
      [
        "install",
        "--id",
        "Git.Git",
        "-e",
        "--source",
        "winget",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity"
      ],
      { stdio: "inherit" }
    );

    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      steps: [
        {
          name: "git",
          state: "completed",
          message: "Installed git from the official source."
        }
      ]
    });
  });

  it("keeps Git as a manual action on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    await expect(runInstallPlan(["git"])).resolves.toEqual({
      ok: false,
      steps: [
        {
          name: "git",
          state: "failed",
          message: "Manual install required for git on macOS. Install Xcode Command Line Tools or Homebrew Git."
        }
      ]
    });
  });

  it("runs the Claude installer command on macOS", async () => {
    platformMock.mockReturnValue("darwin");

    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = runInstallPlan(["claude"]);

    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      "bash",
      ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"],
      { stdio: "inherit" }
    );

    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      ok: true,
      steps: [{ name: "claude", state: "completed", message: "Installed claude from the official source." }]
    });
  });
});
