import { spawn } from "node:child_process";

import { buildLauncherEnv, readConfig } from "./config";

export async function launchClaudeCode(): Promise<number> {
  const config = await readConfig();

  if (!config) {
    throw new Error("Claude configuration is missing.");
  }

  const child = spawn("claude", {
    env: buildLauncherEnv(config),
    stdio: "inherit"
  });

  if (child.pid === undefined) {
    throw new Error("Failed to launch Claude.");
  }

  return child.pid;
}
