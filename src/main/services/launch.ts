import { spawn } from "node:child_process";

interface LaunchClaudeCodeOptions {
  platform?: NodeJS.Platform;
}

interface LaunchedSession {
  cleanup(): Promise<void>;
  isAlive(): Promise<boolean>;
  launchedAt: number;
  startupGraceMs?: number;
}

const launchedSessions = new Map<string, LaunchedSession>();
const MAC_TERMINAL_STARTUP_GRACE_MS = 5_000;

export async function launchClaudeCode(options: LaunchClaudeCodeOptions = {}): Promise<number> {
  const platform = options.platform ?? process.platform;

  if (platform === "darwin") {
    return launchInMacTerminal();
  }

  if (platform === "win32") {
    return launchInWindowsConsole();
  }

  return launchDirectly();
}

export async function cleanupLaunchedClaudeCode(options: LaunchClaudeCodeOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const sessions = [...launchedSessions.entries()];
  launchedSessions.clear();

  await Promise.allSettled(
    sessions.map(async ([id, session]) => {
      try {
        await session.cleanup();
      } catch (error) {
        if (!isMissingProcessError(error, platform)) {
          throw error;
        }
      } finally {
        launchedSessions.delete(id);
      }
    })
  );
}

export async function getClaudeLaunchState(): Promise<boolean> {
  const sessions = [...launchedSessions.entries()];
  const now = Date.now();
  let hasActiveSession = false;

  for (const [id, session] of sessions) {
    const alive = await session.isAlive();

    if (alive) {
      hasActiveSession = true;
      continue;
    }

    const withinStartupGrace =
      typeof session.startupGraceMs === "number" && now - session.launchedAt < session.startupGraceMs;

    if (withinStartupGrace) {
      hasActiveSession = true;
      continue;
    }

    if (!withinStartupGrace) {
      launchedSessions.delete(id);
    }
  }

  return hasActiveSession;
}

export function resetClaudeLaunchStateForTests(): void {
  launchedSessions.clear();
}

async function launchInMacTerminal() {
  const sessionId = createSessionId();
  const child = runOsaScript(
    [
      'tell application "Terminal"',
      "launch",
      'set targetTab to do script ""',
      "delay 1",
      `do script "${escapeAppleScriptString(buildMacLaunchCommand())}" in targetTab`,
      `set custom title of targetTab to "${sessionId}"`,
      "activate",
      "end tell"
    ],
    {
      env: buildLaunchEnv(),
      stdio: "ignore"
    }
  );

  const pid = await waitForSpawn(child);
  const session = {
    cleanup: () => closeMacTerminalSession(sessionId),
    isAlive: () => checkMacTerminalSessionExists(sessionId),
    launchedAt: Date.now(),
    startupGraceMs: MAC_TERMINAL_STARTUP_GRACE_MS
  } satisfies LaunchedSession;

  launchedSessions.set(sessionId, {
    ...session
  });
  return pid;
}

async function launchInWindowsConsole() {
  const child = spawn("cmd.exe", ["/k", buildWindowsLaunchCommand()], {
    env: buildLaunchEnv(),
    stdio: "ignore",
    detached: true,
    windowsHide: false
  });

  child.unref();

  const pid = await waitForSpawn(child);
  const sessionId = `win32:${pid}`;
  child.once("exit", () => {
    launchedSessions.delete(sessionId);
  });

  launchedSessions.set(sessionId, {
    cleanup: () => terminateWindowsProcessTree(pid),
    isAlive: async () => isProcessAlive(pid),
    launchedAt: Date.now()
  });

  return pid;
}

async function launchDirectly() {
  const child = spawn("claude", {
    env: buildLaunchEnv(),
    stdio: "inherit"
  });

  const pid = await waitForSpawn(child);
  const sessionId = `pid:${pid}`;
  child.once("exit", () => {
    launchedSessions.delete(sessionId);
  });

  launchedSessions.set(sessionId, {
    cleanup: async () => {
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        if (!isMissingProcessError(error, process.platform)) {
          throw error;
        }
      }
    },
    isAlive: async () => isProcessAlive(pid),
    launchedAt: Date.now()
  });

  return pid;
}

async function closeMacTerminalSession(sessionId: string) {
  const child = runOsaScript(
    [
      'tell application "Terminal"',
      "repeat with targetWindow in windows",
      "repeat with targetTab in tabs of targetWindow",
      `if custom title of targetTab is "${sessionId}" then`,
      "close targetTab saving no",
      "return",
      "end if",
      "end repeat",
      "end repeat",
      "end tell"
    ],
    {
      env: process.env,
      stdio: "ignore"
    }
  );

  await waitForSpawn(child);
}

async function checkMacTerminalSessionExists(sessionId: string) {
  const child = runOsaScript(
    [
      'tell application "Terminal"',
      "repeat with targetWindow in windows",
      "repeat with targetTab in tabs of targetWindow",
      `if custom title of targetTab is "${sessionId}" then`,
      'return "running"',
      "end if",
      "end repeat",
      "end repeat",
      'return "stopped"',
      "end tell"
    ],
    {
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"]
    }
  );

  const output = await waitForOutput(child);
  return output.trim() === "running";
}

async function terminateWindowsProcessTree(pid: number) {
  const child = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
    stdio: "ignore"
  });

  await waitForSpawn(child);
}

async function waitForSpawn(child: ReturnType<typeof spawn>): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const handleError = (error: Error) => {
      child.off("spawn", handleSpawn);
      const launchError = error as NodeJS.ErrnoException;

      if (launchError.code === "ENOENT") {
        reject(new Error("Claude Code was not found on PATH. Re-run install or restart PClaude Installer."));
        return;
      }

      reject(error);
    };

    const handleSpawn = () => {
      child.off("error", handleError);

      if (child.pid === undefined) {
        reject(new Error("Failed to launch Claude."));
        return;
      }

      resolve(child.pid);
    };

    child.once("error", handleError);
    child.once("spawn", handleSpawn);
  });
}

async function waitForOutput(child: ReturnType<typeof spawn>): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let output = "";

    const handleError = (error: Error) => {
      child.off("close", handleClose);
      reject(error);
    };

    const handleClose = (code: number | null) => {
      child.off("error", handleError);

      if (code && code !== 0) {
        reject(new Error(`Process exited with code ${code}.`));
        return;
      }

      resolve(output);
    };

    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });

    child.once("error", handleError);
    child.once("close", handleClose);
  });
}

function createSessionId() {
  return `pclaude-claude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function runOsaScript(lines: string[], options: Parameters<typeof spawn>[2]) {
  return spawn(
    "osascript",
    lines.flatMap((line) => ["-e", line]),
    options
  );
}

function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isMissingProcessError(error, process.platform);
  }
}

function buildLaunchEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    TERM: undefined,
    COLORTERM: undefined,
    NO_COLOR: undefined,
    COLOR: undefined,
    CLICOLOR: undefined,
    CLICOLOR_FORCE: undefined,
    FORCE_COLOR: undefined
  };
}

function buildMacLaunchCommand() {
  return "claude";
}

function buildWindowsLaunchCommand() {
  return "claude";
}

function escapeAppleScriptString(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function isMissingProcessError(error: unknown, platform: NodeJS.Platform) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as NodeJS.ErrnoException).code : undefined;

  return code === "ESRCH" || (platform === "win32" && code === "ENOENT");
}
