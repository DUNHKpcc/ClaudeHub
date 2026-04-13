import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DiscoveredMcpRecord, DiscoveredSkillRecord } from "../../shared/contracts";

interface LibraryDiscoveryOptions {
  cwd?: string;
  homeDir?: string;
  platform?: NodeJS.Platform;
  appDataDir?: string;
}

export interface LibraryDiscoveryService {
  scanMcpRecords(): Promise<DiscoveredMcpRecord[]>;
  scanSkillRecords(): Promise<DiscoveredSkillRecord[]>;
}

export function createLibraryDiscoveryService(options: LibraryDiscoveryOptions = {}): LibraryDiscoveryService {
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const appDataDir = options.appDataDir ?? process.env.APPDATA ?? "";

  return {
    async scanMcpRecords() {
      const pluginConfigPaths = await listMcpConfigFiles(path.join(homeDir, ".claude", "plugins", "marketplaces"));
      const configCandidates = [
        ...getProjectMcpConfigPaths({ cwd }).map((filePath, index) => ({
          sourceKeyPrefix: `project-mcp-${index}`,
          sourceLabel: "Project MCP",
          path: filePath,
          supportsTopLevelEntries: true
        })),
        ...getClaudeCodeConfigPaths({ homeDir }).map((filePath, index) => ({
          sourceKeyPrefix: `claude-code-${index}`,
          sourceLabel: "Claude Code",
          path: filePath,
          supportsTopLevelEntries: false
        })),
        ...pluginConfigPaths.map((filePath, index) => ({
          sourceKeyPrefix: `claude-plugin-mcp-${index}`,
          sourceLabel: "Claude Plugin MCP",
          path: filePath,
          supportsTopLevelEntries: true
        })),
        {
          sourceKeyPrefix: "claude-desktop",
          sourceLabel: "Claude Desktop",
          path: getClaudeDesktopConfigPath({ platform, homeDir, appDataDir }),
          supportsTopLevelEntries: false
        }
      ];

      const discovered: DiscoveredMcpRecord[] = [];

      for (const candidate of configCandidates) {
        const raw = await readOptionalFile(candidate.path);

        if (!raw) {
          continue;
        }

        const parsed = safeParseJson(raw);
        const serverEntries = extractMcpServerEntries(parsed, candidate.supportsTopLevelEntries);

        discovered.push(
          ...Object.entries(serverEntries).flatMap(([name, value]) => {
            if (!isRecord(value)) {
              return [];
            }

            const { args, command, description } = normalizeDiscoveredMcpConfig(value);
            if (!command) {
              return [];
            }

            return [
              {
                id: `scan-mcp:${candidate.sourceKeyPrefix}:${name}`,
                name,
                command,
                args,
                description,
                enabled: true,
                sourceKey: `${candidate.sourceKeyPrefix}:${candidate.path}:${name}`,
                sourceLabel: candidate.sourceLabel,
                sourcePath: candidate.path,
                imported: false
              } satisfies DiscoveredMcpRecord
            ];
          })
        );
      }

      return dedupeMcpRecords(discovered).sort((left, right) => left.name.localeCompare(right.name));
    },
    async scanSkillRecords() {
      const claudeDir = path.join(homeDir, ".claude");
      const memoryPath = path.join(claudeDir, "CLAUDE.md");
      const commandsDir = path.join(claudeDir, "commands");
      const outputStylesDir = path.join(claudeDir, "output-styles");
      const pluginRoots = [path.join(claudeDir, "plugins", "marketplaces"), path.join(claudeDir, "plugins", "cache")];

      const [memoryContent, commandFiles, styleFiles, pluginEntries] = await Promise.all([
        readOptionalFile(memoryPath),
        listMarkdownFiles(commandsDir),
        listMarkdownFiles(outputStylesDir),
        listClaudePluginSkillEntries(pluginRoots)
      ]);

      const discovered: DiscoveredSkillRecord[] = [];

      if (memoryContent) {
        discovered.push({
          id: "scan-skill:claude-memory",
          name: "CLAUDE.md",
          description: "Claude Code 用户级记忆",
          content: memoryContent.trim(),
          tags: ["memory", "claude"],
          enabled: true,
          sourceKey: `claude-memory:${memoryPath}`,
          sourceLabel: "Claude Code Memory",
          sourcePath: memoryPath,
          imported: false
        });
      }

      for (const filePath of commandFiles) {
        const content = await readOptionalFile(filePath);
        if (!content) {
          continue;
        }

        discovered.push({
          id: `scan-skill:command:${filePath}`,
          name: path.basename(filePath, path.extname(filePath)),
          description: extractDescription(content) || "Claude Code 自定义命令",
          content: content.trim(),
          tags: ["command", "claude"],
          enabled: true,
          sourceKey: `claude-command:${filePath}`,
          sourceLabel: "Claude Code Command",
          sourcePath: filePath,
          imported: false
        });
      }

      for (const filePath of styleFiles) {
        const content = await readOptionalFile(filePath);
        if (!content) {
          continue;
        }

        discovered.push({
          id: `scan-skill:style:${filePath}`,
          name: path.basename(filePath, path.extname(filePath)),
          description: "Claude 输出风格",
          content: content.trim(),
          tags: ["style", "claude"],
          enabled: true,
          sourceKey: `claude-output-style:${filePath}`,
          sourceLabel: "Claude Output Style",
          sourcePath: filePath,
          imported: false
        });
      }

      for (const entry of pluginEntries) {
        const content = await readOptionalFile(entry.filePath);
        if (!content) {
          continue;
        }

        discovered.push({
          id: `scan-skill:${entry.sourceKeyPrefix}:${entry.filePath}`,
          name: entry.name,
          description: extractDescription(content) || `${entry.sourceLabel} 本地内容`,
          content: content.trim(),
          tags: [...entry.tags],
          enabled: true,
          sourceKey: `${entry.sourceKeyPrefix}:${entry.filePath}`,
          sourceLabel: entry.sourceLabel,
          sourcePath: entry.filePath,
          imported: false
        });
      }

      return dedupeSkillRecords(discovered).sort((left, right) => left.name.localeCompare(right.name));
    }
  };
}

function extractMcpServerEntries(
  parsed: Record<string, unknown> | null,
  supportsTopLevelEntries: boolean
): Record<string, unknown> {
  if (!parsed) {
    return {};
  }

  if (isRecord(parsed.mcpServers)) {
    return parsed.mcpServers;
  }

  return supportsTopLevelEntries ? parsed : {};
}

function normalizeDiscoveredMcpConfig(value: Record<string, unknown>) {
  const command = typeof value.command === "string" ? value.command.trim() : "";
  const args = Array.isArray(value.args) ? value.args.filter(isString) : [];
  const description = typeof value.description === "string" ? value.description.trim() : "";

  if (command) {
    return {
      command,
      args,
      description
    };
  }

  if (value.type === "http" && typeof value.url === "string" && value.url.trim()) {
    return {
      command: "http",
      args: [value.url.trim()],
      description: description || "HTTP MCP endpoint"
    };
  }

  return {
    command: "",
    args: [],
    description
  };
}

function getProjectMcpConfigPaths({ cwd }: { cwd: string }) {
  return [path.join(cwd, ".mcp.json"), path.join(cwd, ".claude", ".mcp.json")];
}

function getClaudeCodeConfigPaths({ homeDir }: { homeDir: string }) {
  return [path.join(homeDir, ".claude", "settings.json"), path.join(homeDir, ".claude.json")];
}

function getClaudeDesktopConfigPath({
  platform,
  homeDir,
  appDataDir
}: {
  platform: NodeJS.Platform;
  homeDir: string;
  appDataDir: string;
}) {
  if (platform === "win32" && appDataDir) {
    return path.join(appDataDir, "Claude", "claude_desktop_config.json");
  }

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  return path.join(homeDir, ".config", "Claude", "claude_desktop_config.json");
}

function dedupeMcpRecords(records: DiscoveredMcpRecord[]) {
  const seen = new Set<string>();

  return records.filter((record) => {
    const key = `${record.name}:${record.command}:${JSON.stringify(record.args)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function dedupeSkillRecords(records: DiscoveredSkillRecord[]) {
  const seen = new Set<string>();

  return records.filter((record) => {
    const key = `${record.sourceLabel}:${record.name}:${record.content}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function listMarkdownFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return listMarkdownFiles(childPath);
        }

        return isMarkdownFile(entry.name) ? [childPath] : [];
      })
    );
    return files.flat().sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

async function listSkillEntryFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          return listSkillEntryFiles(childPath);
        }

        return entry.isFile() && entry.name === "SKILL.md" ? [childPath] : [];
      })
    );

    return files.flat().sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

interface ClaudePluginSkillEntry {
  filePath: string;
  name: string;
  sourceKeyPrefix: string;
  sourceLabel: string;
  tags: string[];
}

async function listClaudePluginSkillEntries(pluginRoots: string[]): Promise<ClaudePluginSkillEntry[]> {
  const groups = await Promise.all(pluginRoots.map((pluginRoot) => listClaudePluginSkillEntriesInRoot(pluginRoot)));
  return groups.flat().sort((left, right) => left.filePath.localeCompare(right.filePath));
}

async function listClaudePluginSkillEntriesInRoot(pluginRoot: string): Promise<ClaudePluginSkillEntry[]> {
  try {
    const entries = await fs.readdir(pluginRoot, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(pluginRoot, entry.name);

        if (!entry.isDirectory()) {
          return [];
        }

        return listClaudePluginSkillEntriesInDirectory(childPath);
      })
    );

    return files.flat();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

async function listClaudePluginSkillEntriesInDirectory(dirPath: string): Promise<ClaudePluginSkillEntry[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === "commands") {
            return listPluginMarkdownEntries(childPath, {
              sourceKeyPrefix: "claude-plugin-command",
              sourceLabel: "Claude Plugin Command",
              tags: ["command", "claude", "plugin"]
            });
          }

          if (entry.name === "agents") {
            return listPluginMarkdownEntries(childPath, {
              sourceKeyPrefix: "claude-plugin-agent",
              sourceLabel: "Claude Plugin Agent",
              tags: ["agent", "claude", "plugin"]
            });
          }

          if (entry.name === "skills") {
            return listPluginSkillEntries(childPath, {
              sourceKeyPrefix: "claude-plugin-skill",
              sourceLabel: "Claude Plugin Skill",
              tags: ["skill", "claude", "plugin"]
            });
          }

          return listClaudePluginSkillEntriesInDirectory(childPath);
        }

        return [];
      })
    );

    return files.flat();
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

async function listPluginMarkdownEntries(
  dirPath: string,
  metadata: Omit<ClaudePluginSkillEntry, "filePath" | "name">
): Promise<ClaudePluginSkillEntry[]> {
  const files = await listMarkdownFiles(dirPath);

  return files.map((filePath) => ({
    filePath,
    name: path.basename(filePath, path.extname(filePath)),
    ...metadata
  }));
}

async function listPluginSkillEntries(
  dirPath: string,
  metadata: Omit<ClaudePluginSkillEntry, "filePath" | "name">
): Promise<ClaudePluginSkillEntry[]> {
  const files = await listSkillEntryFiles(dirPath);

  return files.map((filePath) => ({
    filePath,
    name: path.basename(path.dirname(filePath)),
    ...metadata
  }));
}

async function listMcpConfigFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          return listMcpConfigFiles(childPath);
        }

        return entry.isFile() && entry.name === ".mcp.json" ? [childPath] : [];
      })
    );

    return files.flat().sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
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
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractDescription(content: string) {
  const match = content.match(/description:\s*(.+)/i);
  return match?.[1]?.trim() ?? "";
}

function isMarkdownFile(fileName: string) {
  return fileName.toLowerCase().endsWith(".md");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (error === null || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
