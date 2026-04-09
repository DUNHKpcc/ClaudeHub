import { spawn } from "node:child_process";
import os from "node:os";

import type { InstallResult } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";

type InstallableDependencyName = "node" | "git" | "claude";

const installableDependencies = new Set<InstallableDependencyName>(["node", "git", "claude"]);
const pendingStates = new Set<DependencyStatus["state"]>(["missing", "outdated"]);

type InstallStepResult = InstallResult["steps"][number] & {
  message?: string;
};

export function buildInstallPlan(dependencies: DependencyStatus[]): InstallableDependencyName[] {
  const plan = new Set<InstallableDependencyName>();

  for (const dependency of dependencies) {
    if (!installableDependencies.has(dependency.name as InstallableDependencyName)) {
      continue;
    }

    if (!pendingStates.has(dependency.state)) {
      continue;
    }

    plan.add(dependency.name as InstallableDependencyName);
  }

  return Array.from(plan);
}

function spawnClaudeInstaller(): Promise<void> {
  const platform = os.platform();
  const isWindows = platform === "win32";
  const command = isWindows ? "powershell" : "bash";
  const args = isWindows
    ? [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://claude.ai/install.ps1 | iex"
      ]
    : ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"];

  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Claude installer exited with code ${code ?? "unknown"}.`));
    });
  });
}

export async function runInstallPlan(
  plan: InstallableDependencyName[]
): Promise<InstallResult> {
  const steps: InstallStepResult[] = [];

  for (const name of plan) {
    if (name !== "claude") {
      steps.push({
        name,
        state: "failed",
        message: `Manual install required for ${name}.`
      });
      continue;
    }

    try {
      await spawnClaudeInstaller();
      steps.push({
        name: "claude",
        state: "completed"
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Claude installer failed to complete.";

      steps.push({
        name: "claude",
        state: "failed",
        message
      });
    }
  }

  return {
    ok: steps.every((step) => step.state === "completed"),
    steps
  } as InstallResult;
}
