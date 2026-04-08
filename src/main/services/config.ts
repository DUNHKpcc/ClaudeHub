import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ConfigInput } from "../../shared/schemas";
import { configInputSchema } from "../../shared/schemas";

const CONFIG_DIR = path.join(os.homedir(), ".pclaude-installer");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

export function buildLauncherEnv(config: ConfigInput): NodeJS.ProcessEnv {
  const parsedConfig = configInputSchema.parse(config);

  return {
    ...process.env,
    ANTHROPIC_API_KEY: parsedConfig.apiKey,
    ANTHROPIC_BASE_URL: parsedConfig.baseUrl || undefined,
    ANTHROPIC_MODEL: parsedConfig.model
  };
}

export async function saveConfig(config: ConfigInput): Promise<void> {
  const parsedConfig = configInputSchema.parse(config);

  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(parsedConfig, null, 2)}\n`, "utf8");
}

export async function readConfig(): Promise<ConfigInput | null> {
  try {
    const contents = await fs.readFile(CONFIG_PATH, "utf8");
    return configInputSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (error === null || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
