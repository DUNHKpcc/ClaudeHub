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
