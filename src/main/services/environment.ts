import { execFile as execFileCallback } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

import type { DetectEnvironmentResult } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";

const execFile = promisify(execFileCallback);

export const minimumVersions: Record<DependencyStatus["name"], string> = {
  node: "18.0.0",
  npm: "9.0.0",
  git: "2.0.0",
  claude: "0.0.0"
};

function parseVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

async function locateBinary(command: string): Promise<string | undefined> {
  const locator = os.platform() === "win32" ? "where" : "which";

  try {
    const { stdout } = await execFile(locator, [command]);
    return stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean);
  } catch {
    return undefined;
  }
}

export function normalizeDependencyState(
  version: string | null,
  minimumVersion: string
): DependencyStatus["state"] {
  if (version === null) {
    return "missing";
  }

  return compareVersions(version, minimumVersion) >= 0 ? "installed" : "outdated";
}

export async function detectBinary(
  name: DependencyStatus["name"],
  command: string,
  versionArgs: string[]
): Promise<DependencyStatus> {
  const binaryPath = await locateBinary(command);

  if (!binaryPath) {
    return {
      name,
      state: "missing",
      message: `${command} was not found on PATH.`
    };
  }

  try {
    const { stdout, stderr } = await execFile(command, versionArgs);
    const version = parseVersion(`${stdout}\n${stderr}`);
    const minimumVersion = minimumVersions[name];
    const state = normalizeDependencyState(version, minimumVersion);

    return {
      name,
      state,
      path: binaryPath,
      version: version ?? undefined,
      message: state === "outdated" ? `Requires ${minimumVersion} or newer.` : undefined
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to inspect dependency.";

    return {
      name,
      state: "broken",
      path: binaryPath,
      message
    };
  }
}

export async function detectEnvironment(): Promise<DetectEnvironmentResult> {
  const dependencies = await Promise.all([
    detectBinary("node", "node", ["--version"]),
    detectBinary("npm", "npm", ["--version"]),
    detectBinary("git", "git", ["--version"]),
    detectBinary("claude", "claude", ["--version"])
  ]);

  return {
    dependencies,
    platform: os.platform(),
    arch: os.arch()
  };
}
