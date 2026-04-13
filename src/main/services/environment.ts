import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { DetectEnvironmentResult } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";

const execFile = promisify(execFileCallback);
const coreDependencyNames = new Set<DependencyStatus["name"]>(["node", "npm", "git", "claude"]);

export const minimumVersions: Record<DependencyStatus["name"], string> = {
  node: "18.0.0",
  npm: "9.0.0",
  git: "2.0.0",
  claude: "0.0.0",
  mcp_market: "0.0.0",
  skill_market: "0.0.0"
};

interface EnvironmentDetectionOptions {
  arch?: string;
  cwd?: string;
  detectBinaryFn?: typeof detectBinary;
  homeDir?: string;
  platform?: NodeJS.Platform;
}

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
  if (!coreDependencyNames.has(name)) {
    throw new Error(`detectBinary only supports core dependencies. Received ${name}.`);
  }

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

function buildMarketplaceDependencyStatus({
  configuredCount,
  discoveredSummary,
  name
}: {
  configuredCount: number;
  discoveredSummary: string;
  name: "mcp_market" | "skill_market";
}): DependencyStatus {
  const hasMarket = configuredCount > 0;

  return {
    name,
    state: hasMarket ? "installed" : "missing",
    version: hasMarket ? `已检测到 ${configuredCount} 项` : "未检测到",
    path: discoveredSummary,
    message: hasMarket ? "已基于 Claude Code 官方位置检测到配置。" : "Claude Code 官方位置中未检测到配置。"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

async function readOptionalJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    return null;
  }
}

function countMcpServers(record: Record<string, unknown> | null): number {
  return countMcpConfigEntries(record, false);
}

function countMcpConfigEntries(record: Record<string, unknown> | null, supportsTopLevelEntries: boolean): number {
  if (!record) {
    return 0;
  }

  const serverEntries = isRecord(record.mcpServers) ? record.mcpServers : supportsTopLevelEntries ? record : null;

  if (!serverEntries) {
    return 0;
  }

  return Object.values(serverEntries).reduce<number>((total, value) => {
    if (!isRecord(value)) {
      return total;
    }

    if (typeof value.command === "string" && value.command.trim()) {
      return total + 1;
    }

    if (value.type === "http" && typeof value.url === "string" && value.url.trim()) {
      return total + 1;
    }

    return total;
  }, 0);
}

function countProjectScopedMcpServers(record: Record<string, unknown> | null): number {
  if (!record || !isRecord(record.projects)) {
    return 0;
  }

  return Object.values(record.projects).reduce<number>((total, entry) => {
    if (!isRecord(entry) || !isRecord(entry.mcpServers)) {
      return total;
    }

    return total + Object.keys(entry.mcpServers).length;
  }, 0);
}

function summarizeDetectedLocations(locations: string[]): string {
  return locations.length > 0 ? locations.join(" / ") : "未发现";
}

function getManagedMcpConfigPath(platform: NodeJS.Platform) {
  if (platform === "darwin") {
    return "/Library/Application Support/ClaudeCode/managed-mcp.json";
  }

  if (platform === "win32") {
    return "C:\\Program Files\\ClaudeCode\\managed-mcp.json";
  }

  return "/etc/claude-code/managed-mcp.json";
}

function getPluginMarketplaceMcpRoot(homeDir: string) {
  return path.join(homeDir, ".claude", "plugins", "marketplaces");
}

function getClaudeCodeMcpConfigPaths(homeDir: string) {
  return [
    {
      path: path.join(homeDir, ".claude", "settings.json"),
      userLabel: "用户级 ~/.claude/settings.json",
      projectLabel: "本地项目 ~/.claude/settings.json"
    },
    {
      path: path.join(homeDir, ".claude.json"),
      userLabel: "用户级 ~/.claude.json",
      projectLabel: "本地项目 ~/.claude.json"
    }
  ];
}

function getProjectMcpConfigPaths(cwd: string) {
  return [
    {
      path: path.join(cwd, ".mcp.json"),
      label: "项目级 .mcp.json"
    },
    {
      path: path.join(cwd, ".claude", ".mcp.json"),
      label: "项目级 .claude/.mcp.json"
    }
  ];
}

async function detectMcpMarketplaceDependency(options: EnvironmentDetectionOptions): Promise<DependencyStatus> {
  const homeDir = options.homeDir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? os.platform();

  const claudeCodeConfigPaths = getClaudeCodeMcpConfigPaths(homeDir);
  const projectConfigPaths = getProjectMcpConfigPaths(cwd);
  const pluginMarketplaceRoot = getPluginMarketplaceMcpRoot(homeDir);
  const managedConfigPath = getManagedMcpConfigPath(platform);

  const [claudeCodeConfigs, projectConfigs, pluginConfigPaths, managedConfig] = await Promise.all([
    Promise.all(claudeCodeConfigPaths.map(async (candidate) => ({ ...candidate, config: await readOptionalJson(candidate.path) }))),
    Promise.all(projectConfigPaths.map(async (candidate) => ({ ...candidate, config: await readOptionalJson(candidate.path) }))),
    listMcpConfigFiles(pluginMarketplaceRoot),
    readOptionalJson(managedConfigPath)
  ]);
  const pluginConfigs = await Promise.all(pluginConfigPaths.map(async (filePath) => ({ path: filePath, config: await readOptionalJson(filePath) })));

  const userScopedCount = claudeCodeConfigs.reduce<number>((total, candidate) => total + countMcpServers(candidate.config), 0);
  const localScopedCount = claudeCodeConfigs.reduce<number>(
    (total, candidate) => total + countProjectScopedMcpServers(candidate.config),
    0
  );
  const projectScopedCount = projectConfigs.reduce<number>((total, candidate) => total + countMcpServers(candidate.config), 0);
  const pluginScopedCount = pluginConfigs.reduce<number>(
    (total, candidate) => total + countMcpConfigEntries(candidate.config, true),
    0
  );
  const managedScopedCount = countMcpServers(managedConfig);

  const locations = [
    ...claudeCodeConfigs.flatMap((candidate) => {
      const candidateLocations: string[] = [];

      if (countMcpServers(candidate.config) > 0) {
        candidateLocations.push(candidate.userLabel);
      }

      if (countProjectScopedMcpServers(candidate.config) > 0) {
        candidateLocations.push(candidate.projectLabel);
      }

      return candidateLocations;
    }),
    ...projectConfigs.flatMap((candidate) => (countMcpServers(candidate.config) > 0 ? [candidate.label] : [])),
    pluginScopedCount > 0 ? "插件级 ~/.claude/plugins/marketplaces" : null,
    managedScopedCount > 0 ? "系统级 managed-mcp.json" : null
  ].filter((location): location is string => Boolean(location));

  return buildMarketplaceDependencyStatus({
    name: "mcp_market",
    configuredCount: userScopedCount + localScopedCount + projectScopedCount + pluginScopedCount + managedScopedCount,
    discoveredSummary: summarizeDetectedLocations(locations)
  });
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function countSkillFilesInDirectory(rootDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const nestedCounts: number[] = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
          const skillEntryPath = path.join(childPath, "SKILL.md");
          return (await pathExists(skillEntryPath)) ? 1 : 0;
        }

        return 0;
      })
    );

    return nestedCounts.reduce<number>((total, count) => total + count, 0);
  } catch (error) {
    if (isMissingFileError(error)) {
      return 0;
    }

    return 0;
  }
}

async function countFileIfExists(filePath: string): Promise<number> {
  return (await pathExists(filePath)) ? 1 : 0;
}

async function countMarkdownFiles(rootDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const nestedCounts = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
          return countMarkdownFiles(childPath);
        }

        return entry.isFile() && entry.name.toLowerCase().endsWith(".md") ? 1 : 0;
      })
    );

    return nestedCounts.reduce<number>((total, count) => total + count, 0);
  } catch (error) {
    if (isMissingFileError(error)) {
      return 0;
    }

    return 0;
  }
}

async function countPluginSkillEntries(pluginRoots: string[]): Promise<number> {
  const counts = await Promise.all(pluginRoots.map(async (pluginRoot) => countPluginSkillEntriesInRoot(pluginRoot)));
  return counts.reduce<number>((total, count) => total + count, 0);
}

async function countPluginSkillEntriesInRoot(pluginRoot: string): Promise<number> {
  try {
    const entries = await fs.readdir(pluginRoot, { withFileTypes: true });
    const nestedCounts = await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) {
          return 0;
        }

        return countPluginSkillEntriesInDirectory(path.join(pluginRoot, entry.name));
      })
    );

    return nestedCounts.reduce<number>((total, count) => total + count, 0);
  } catch (error) {
    if (isMissingFileError(error)) {
      return 0;
    }

    return 0;
  }
}

async function countPluginSkillEntriesInDirectory(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nestedCounts = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(dirPath, entry.name);

        if (!entry.isDirectory()) {
          return 0;
        }

        if (entry.name === "commands" || entry.name === "agents") {
          return countMarkdownFiles(childPath);
        }

        if (entry.name === "skills") {
          return countSkillFilesInDirectory(childPath);
        }

        return countPluginSkillEntriesInDirectory(childPath);
      })
    );

    return nestedCounts.reduce<number>((total, count) => total + count, 0);
  } catch (error) {
    if (isMissingFileError(error)) {
      return 0;
    }

    return 0;
  }
}

async function listMcpConfigFiles(rootDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const nestedPaths = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(rootDir, entry.name);

        if (entry.isDirectory()) {
          return listMcpConfigFiles(childPath);
        }

        return entry.isFile() && entry.name === ".mcp.json" ? [childPath] : [];
      })
    );

    return nestedPaths.flat().sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    return [];
  }
}

async function detectSkillMarketplaceDependency(options: EnvironmentDetectionOptions): Promise<DependencyStatus> {
  const homeDir = options.homeDir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const claudeDir = path.join(homeDir, ".claude");

  const userMemoryPath = path.join(claudeDir, "CLAUDE.md");
  const userSkillsDir = path.join(claudeDir, "skills");
  const projectSkillsDir = path.join(cwd, ".claude", "skills");
  const userCommandsDir = path.join(claudeDir, "commands");
  const projectCommandsDir = path.join(cwd, ".claude", "commands");
  const userOutputStylesDir = path.join(claudeDir, "output-styles");
  const pluginRoots = [path.join(claudeDir, "plugins", "marketplaces"), path.join(claudeDir, "plugins", "cache")];

  const [userMemoryCount, userSkillsCount, projectSkillsCount, userCommandsCount, projectCommandsCount, userOutputStylesCount, pluginSkillCount] = await Promise.all([
    countFileIfExists(userMemoryPath),
    countSkillFilesInDirectory(userSkillsDir),
    countSkillFilesInDirectory(projectSkillsDir),
    countMarkdownFiles(userCommandsDir),
    countMarkdownFiles(projectCommandsDir),
    countMarkdownFiles(userOutputStylesDir),
    countPluginSkillEntries(pluginRoots)
  ]);

  const locations = [
    userMemoryCount > 0 ? "用户级 ~/.claude/CLAUDE.md" : null,
    userSkillsCount > 0 ? "用户级 ~/.claude/skills" : null,
    projectSkillsCount > 0 ? "项目级 .claude/skills" : null,
    userCommandsCount > 0 ? "用户级 ~/.claude/commands" : null,
    projectCommandsCount > 0 ? "项目级 .claude/commands" : null,
    userOutputStylesCount > 0 ? "用户级 ~/.claude/output-styles" : null,
    pluginSkillCount > 0 ? "插件级 ~/.claude/plugins" : null
  ].filter((location): location is string => Boolean(location));

  return buildMarketplaceDependencyStatus({
    name: "skill_market",
    configuredCount:
      userMemoryCount +
      userSkillsCount +
      projectSkillsCount +
      userCommandsCount +
      projectCommandsCount +
      userOutputStylesCount +
      pluginSkillCount,
    discoveredSummary: summarizeDetectedLocations(locations)
  });
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return Boolean(error && typeof error === "object" && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT");
}

async function detectMarketplaceDependencies(options: EnvironmentDetectionOptions): Promise<DependencyStatus[]> {
  return Promise.all([detectMcpMarketplaceDependency(options), detectSkillMarketplaceDependency(options)]);
}

export async function detectEnvironment(options: EnvironmentDetectionOptions = {}): Promise<DetectEnvironmentResult> {
  const detectBinaryFn = options.detectBinaryFn ?? detectBinary;
  const dependencies = await Promise.all([
    detectBinaryFn("node", "node", ["--version"]),
    detectBinaryFn("npm", "npm", ["--version"]),
    detectBinaryFn("git", "git", ["--version"]),
    detectBinaryFn("claude", "claude", ["--version"])
  ]);
  const marketplaceDependencies = await detectMarketplaceDependencies(options);

  return {
    dependencies: [...dependencies, ...marketplaceDependencies],
    platform: options.platform ?? os.platform(),
    arch: options.arch ?? os.arch()
  };
}
