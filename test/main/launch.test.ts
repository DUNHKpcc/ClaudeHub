import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock
  }
}));

import {
  cleanupLaunchedClaudeCode,
  getClaudeLaunchState,
  launchClaudeCode,
  resetClaudeLaunchStateForTests
} from "../../src/main/services/launch";

class MockChildProcess extends EventEmitter {
  pid?: number;
  stdout?: EventEmitter;

  unref = vi.fn();
}

describe("launch service", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    resetClaudeLaunchStateForTests();
  });

  afterEach(() => {
    resetClaudeLaunchStateForTests();
  });

  it("opens Terminal and runs claude on macOS", async () => {
    const child = new MockChildProcess();
    child.pid = 1234;
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode({ platform: "darwin" });
    let settled = false;
    void resultPromise.then(() => {
      settled = true;
    });

    await Promise.resolve();

    expect(settled).toBe(false);
    const [command, args, options] = spawnMock.mock.calls[0]!;
    expect(command).toBe("osascript");
    expect(args).toEqual([
      "-e",
      'tell application "Terminal"',
      "-e",
      "launch",
      "-e",
      'set targetTab to do script ""',
      "-e",
      "delay 1",
      "-e",
      'do script "claude" in targetTab',
      "-e",
      expect.stringContaining('set custom title of targetTab to "pclaude-claude-'),
      "-e",
      "activate",
      "-e",
      "end tell"
    ]);
    expect(options).toEqual({
      env: expect.objectContaining({
        TERM: undefined,
        COLORTERM: undefined,
        NO_COLOR: undefined,
        COLOR: undefined,
        CLICOLOR: undefined,
        CLICOLOR_FORCE: undefined,
        FORCE_COLOR: undefined
      }),
      stdio: "ignore"
    });

    child.emit("spawn");

    await expect(resultPromise).resolves.toBe(1234);
  });

  it("rejects if the child emits an error before spawning", async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode({ platform: "darwin" });
    const spawnError = new Error("spawn failed");

    await Promise.resolve();

    child.emit("error", spawnError);

    await expect(resultPromise).rejects.toThrow("spawn failed");
  });

  it("surfaces a PATH guidance error when claude is missing", async () => {
    const child = new MockChildProcess();
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode({ platform: "darwin" });
    const spawnError = new Error("spawn failed") as NodeJS.ErrnoException;
    spawnError.code = "ENOENT";

    await Promise.resolve();

    child.emit("error", spawnError);

    await expect(resultPromise).rejects.toThrow(
      "Claude Code was not found on PATH. Re-run install or restart PClaude Installer."
    );
  });

  it("opens a new command window and runs claude on Windows", async () => {
    const child = new MockChildProcess();
    child.pid = 2468;
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode({ platform: "win32" });

    await Promise.resolve();

    expect(spawnMock).toHaveBeenCalledWith(
      "cmd.exe",
      ["/k", "claude"],
      {
        env: expect.objectContaining({
          TERM: undefined,
          COLORTERM: undefined,
          NO_COLOR: undefined,
          COLOR: undefined,
          CLICOLOR: undefined,
          CLICOLOR_FORCE: undefined,
          FORCE_COLOR: undefined
        }),
        stdio: "ignore",
        detached: true,
        windowsHide: false
      }
    );
    expect(child.unref).toHaveBeenCalledTimes(1);

    child.emit("spawn");

    await expect(resultPromise).resolves.toBe(2468);
  });

  it("falls back to spawning claude directly on Linux", async () => {
    const child = new MockChildProcess();
    child.pid = 5678;
    spawnMock.mockReturnValue(child);

    const resultPromise = launchClaudeCode({ platform: "linux" });

    await Promise.resolve();

    const [command, options] = spawnMock.mock.calls[0]!;
    expect(command).toBe("claude");
    expect(options).toEqual({
      env: expect.objectContaining({
        TERM: undefined,
        COLORTERM: undefined,
        NO_COLOR: undefined,
        COLOR: undefined,
        CLICOLOR: undefined,
        CLICOLOR_FORCE: undefined,
        FORCE_COLOR: undefined
      }),
      stdio: "inherit"
    });

    child.emit("spawn");

    await expect(resultPromise).resolves.toBe(5678);
  });

  it("reports false after a directly launched Claude process exits", async () => {
    const child = new MockChildProcess();
    child.pid = 7788;
    spawnMock.mockReturnValue(child);
    let exited = false;
    const killSpy = vi.spyOn(process, "kill").mockImplementation(((pid: number, signal?: NodeJS.Signals | number) => {
      if (pid === 7788 && signal === 0 && !exited) {
        return true;
      }

      if (pid === 7788 && signal === 0 && exited) {
        const error = new Error("missing") as NodeJS.ErrnoException;
        error.code = "ESRCH";
        throw error;
      }

      return true;
    }) as typeof process.kill);

    const resultPromise = launchClaudeCode({ platform: "linux" });
    await Promise.resolve();
    child.emit("spawn");
    await expect(resultPromise).resolves.toBe(7788);

    await expect(getClaudeLaunchState()).resolves.toBe(true);

    exited = true;
    child.emit("exit", 0);

    await expect(getClaudeLaunchState()).resolves.toBe(false);
    killSpy.mockRestore();
  });

  it("closes launched Terminal sessions on macOS app shutdown", async () => {
    const child = new MockChildProcess();
    child.pid = 1357;
    spawnMock.mockReturnValue(child);

    const launchPromise = launchClaudeCode({ platform: "darwin" });
    await Promise.resolve();
    child.emit("spawn");
    await expect(launchPromise).resolves.toBe(1357);

    spawnMock.mockClear();

    const cleanupChild = new MockChildProcess();
    cleanupChild.pid = 2468;
    spawnMock.mockReturnValue(cleanupChild);

    const cleanupPromise = cleanupLaunchedClaudeCode({ platform: "darwin" });
    await Promise.resolve();
    cleanupChild.emit("spawn");
    await cleanupPromise;

    expect(spawnMock).toHaveBeenCalledWith(
      "osascript",
      expect.arrayContaining([
        "-e",
        'tell application "Terminal"',
        "-e",
        expect.stringContaining('if custom title of targetTab is "pclaude-claude-'),
        "-e",
        "close targetTab saving no",
        "-e",
        "end tell"
      ]),
      {
        env: process.env,
        stdio: "ignore"
      }
    );
  });

  it("builds the macOS Terminal state-check script as discrete osascript lines", async () => {
    const launchChild = new MockChildProcess();
    launchChild.pid = 1357;
    const checkChild = new MockChildProcess();
    checkChild.pid = 2468;
    checkChild.stdout = new EventEmitter() as any;
    spawnMock.mockReturnValueOnce(launchChild).mockReturnValueOnce(checkChild);

    const launchPromise = launchClaudeCode({ platform: "darwin" });
    await Promise.resolve();
    launchChild.emit("spawn");
    await expect(launchPromise).resolves.toBe(1357);

    const statePromise = getClaudeLaunchState();
    await Promise.resolve();

    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      "osascript",
      [
        "-e",
        'tell application "Terminal"',
        "-e",
        "repeat with targetWindow in windows",
        "-e",
        "repeat with targetTab in tabs of targetWindow",
        "-e",
        expect.stringContaining('if custom title of targetTab is "pclaude-claude-'),
        "-e",
        'return "running"',
        "-e",
        "end if",
        "-e",
        "end repeat",
        "-e",
        "end repeat",
        "-e",
        'return "stopped"',
        "-e",
        "end tell"
      ],
      {
        env: process.env,
        stdio: ["ignore", "pipe", "ignore"]
      }
    );

    checkChild.emit("spawn");
    checkChild.stdout!.emit("data", Buffer.from("running\n"));
    checkChild.emit("close", 0);

    await expect(statePromise).resolves.toBe(true);
  });

  it("keeps a macOS launch session alive during the Terminal startup grace period", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(1_000);

    const launchChild = new MockChildProcess();
    launchChild.pid = 1357;
    const firstCheckChild = new MockChildProcess();
    firstCheckChild.pid = 2468;
    firstCheckChild.stdout = new EventEmitter();
    const secondCheckChild = new MockChildProcess();
    secondCheckChild.pid = 3579;
    secondCheckChild.stdout = new EventEmitter();
    spawnMock
      .mockReturnValueOnce(launchChild)
      .mockReturnValueOnce(firstCheckChild)
      .mockReturnValueOnce(secondCheckChild);

    const launchPromise = launchClaudeCode({ platform: "darwin" });
    await Promise.resolve();
    launchChild.emit("spawn");
    await expect(launchPromise).resolves.toBe(1357);

    nowSpy.mockReturnValueOnce(1_500);
    const firstStatePromise = getClaudeLaunchState();
    await Promise.resolve();
    firstCheckChild.emit("spawn");
    firstCheckChild.stdout?.emit("data", Buffer.from("stopped\n"));
    firstCheckChild.emit("close", 0);
    await expect(firstStatePromise).resolves.toBe(true);

    nowSpy.mockReturnValueOnce(3_500);
    const secondStatePromise = getClaudeLaunchState();
    await Promise.resolve();
    secondCheckChild.emit("spawn");
    secondCheckChild.stdout?.emit("data", Buffer.from("running\n"));
    secondCheckChild.emit("close", 0);
    await expect(secondStatePromise).resolves.toBe(true);

    nowSpy.mockRestore();
  });

  it("kills launched Windows command sessions on app shutdown", async () => {
    const child = new MockChildProcess();
    child.pid = 9753;
    spawnMock.mockReturnValue(child);

    const launchPromise = launchClaudeCode({ platform: "win32" });
    await Promise.resolve();
    child.emit("spawn");
    await expect(launchPromise).resolves.toBe(9753);

    spawnMock.mockClear();

    const cleanupChild = new MockChildProcess();
    cleanupChild.pid = 8642;
    spawnMock.mockReturnValue(cleanupChild);

    const cleanupPromise = cleanupLaunchedClaudeCode({ platform: "win32" });
    await Promise.resolve();
    cleanupChild.emit("spawn");
    await cleanupPromise;

    expect(spawnMock).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "9753", "/t", "/f"],
      {
        stdio: "ignore"
      }
    );
  });
});
