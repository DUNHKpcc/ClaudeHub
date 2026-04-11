import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ConfigInput } from "../../shared/schemas";
import { configInputSchema } from "../../shared/schemas";

interface ConfigServiceOptions {
  homeDir?: string;
}

export function buildLauncherEnv(config: ConfigInput): NodeJS.ProcessEnv {
  const parsedConfig = configInputSchema.parse(config);

  return {
    ...process.env,
    ANTHROPIC_API_KEY: parsedConfig.apiKey,
    ANTHROPIC_BASE_URL: parsedConfig.baseUrl || undefined,
    ANTHROPIC_MODEL: parsedConfig.model
  };
}

export async function saveConfig(config: ConfigInput, options: ConfigServiceOptions = {}): Promise<void> {
  const parsedConfig = configInputSchema.parse(config);
  const configPath = getAppConfigPath(options.homeDir);

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(parsedConfig, null, 2)}\n`, "utf8");
}

export async function readConfig(options: ConfigServiceOptions = {}): Promise<ConfigInput | null> {
  const configPath = getAppConfigPath(options.homeDir);

  try {
    const contents = await fs.readFile(configPath, "utf8");
    return configInputSchema.parse(JSON.parse(contents));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

export async function readConfigPlaceholders(
  options: ConfigServiceOptions = {}
): Promise<Partial<ConfigInput> | null> {
  const [appConfig, claudeConfig] = await Promise.all([
    readConfig(options),
    readClaudeSettingsConfig(options.homeDir)
  ]);

  const merged = {
    apiKey: claudeConfig?.apiKey ?? appConfig?.apiKey ?? "",
    baseUrl: claudeConfig?.baseUrl ?? appConfig?.baseUrl ?? "",
    model: claudeConfig?.model ?? appConfig?.model ?? ""
  };

  return merged.apiKey || merged.baseUrl || merged.model ? merged : null;
}

async function readClaudeSettingsConfig(homeDir = os.homedir()): Promise<Partial<ConfigInput> | null> {
  for (const configPath of getClaudeConfigPaths(homeDir)) {
    const raw = await readOptionalFile(configPath);

    if (!raw) {
      continue;
    }

    const parsed = safeParseJson(raw);
    if (!parsed || !parsed.env || typeof parsed.env !== "object") {
      continue;
    }

    const env = parsed.env as Record<string, unknown>;
    const apiKey = readOptionalString(env.ANTHROPIC_API_KEY) || readOptionalString(env.ANTHROPIC_AUTH_TOKEN);
    const baseUrl = readOptionalString(env.ANTHROPIC_BASE_URL);
    const model = readOptionalString(env.ANTHROPIC_MODEL);

    if (apiKey || baseUrl || model) {
      return {
        apiKey: apiKey ?? "",
        baseUrl: baseUrl ?? "",
        model: model ?? ""
      };
    }
  }

  return null;
}

function getAppConfigPath(homeDir = os.homedir()) {
  return path.join(homeDir, ".pclaude-installer", "config.json");
}

function getClaudeConfigPaths(homeDir: string) {
  return [path.join(homeDir, ".claude", "settings.json"), path.join(homeDir, ".claude.json")];
}

async function readOptionalFile(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (error === null || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
