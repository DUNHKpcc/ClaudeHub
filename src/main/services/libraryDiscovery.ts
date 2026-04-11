import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DiscoveredMcpRecord, DiscoveredSkillRecord } from "../../shared/contracts";

interface LibraryDiscoveryOptions {
  homeDir?: string;
  platform?: NodeJS.Platform;
  appDataDir?: string;
}

export interface LibraryDiscoveryService {
  scanMcpRecords(): Promise<DiscoveredMcpRecord[]>;
  scanSkillRecords(): Promise<DiscoveredSkillRecord[]>;
}

export function createLibraryDiscoveryService(options: LibraryDiscoveryOptions = {}): LibraryDiscoveryService {
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const appDataDir = options.appDataDir ?? process.env.APPDATA ?? "";

  return {
    async scanMcpRecords() {
      const configCandidates = [
        ...getClaudeCodeConfigPaths({ homeDir }).map((filePath, index) => ({
          sourceKeyPrefix: `claude-code-${index}`,
          sourceLabel: "Claude Code",
          path: filePath
        })),
        {
          sourceKeyPrefix: "claude-desktop",
          sourceLabel: "Claude Desktop",
          path: getClaudeDesktopConfigPath({ platform, homeDir, appDataDir })
        }
      ];

      const discovered: DiscoveredMcpRecord[] = [];

      for (const candidate of configCandidates) {
        const raw = await readOptionalFile(candidate.path);

        if (!raw) {
          continue;
        }

        const parsed = safeParseJson(raw);
        const serverEntries = parsed?.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : {};

        discovered.push(
          ...Object.entries(serverEntries).flatMap(([name, value]) => {
            if (!value || typeof value !== "object") {
              return [];
            }

            const command = typeof value.command === "string" ? value.command.trim() : "";
            if (!command) {
              return [];
            }

            return [
              {
                id: `scan-mcp:${candidate.sourceKeyPrefix}:${name}`,
                name,
                command,
                args: Array.isArray(value.args) ? value.args.filter(isString) : [],
                description: typeof value.description === "string" ? value.description.trim() : "",
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

      const [memoryContent, commandFiles, styleFiles] = await Promise.all([
        readOptionalFile(memoryPath),
        listMarkdownFiles(commandsDir),
        listMarkdownFiles(outputStylesDir)
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

      return discovered.sort((left, right) => left.name.localeCompare(right.name));
    }
  };
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

function safeParseJson(raw: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, any>;
    return parsed && typeof parsed === "object" ? parsed : null;
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
