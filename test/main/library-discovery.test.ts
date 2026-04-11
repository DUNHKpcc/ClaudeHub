import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLibraryDiscoveryService } from "../../src/main/services/libraryDiscovery";

const tempPaths: string[] = [];

describe("library discovery service", () => {
  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map(async (tempPath) => {
        await fs.rm(tempPath, { recursive: true, force: true });
      })
    );
  });

  it("discovers Claude Code MCP servers from ~/.claude/settings.json on macOS", async () => {
    const homeDir = await createTempHome();
    const configPath = path.join(homeDir, ".claude", "settings.json");

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const service = createLibraryDiscoveryService({
      homeDir,
      platform: "darwin"
    });

    await expect(service.scanMcpRecords()).resolves.toEqual([
      expect.objectContaining({
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        sourceLabel: "Claude Code",
        sourcePath: configPath
      })
    ]);
  });

  it("discovers Claude Code MCP servers from ~/.claude.json on macOS", async () => {
    const homeDir = await createTempHome();
    const configPath = path.join(homeDir, ".claude.json");

    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            sequentialthinking: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const service = createLibraryDiscoveryService({
      homeDir,
      platform: "darwin"
    });

    await expect(service.scanMcpRecords()).resolves.toEqual([
      expect.objectContaining({
        name: "sequentialthinking",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
        sourceLabel: "Claude Code",
        sourcePath: configPath
      })
    ]);
  });

  it("discovers Claude Code MCP servers from ~/.claude/settings.json on Windows", async () => {
    const homeDir = await createTempHome();
    const configPath = path.join(homeDir, ".claude", "settings.json");

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const service = createLibraryDiscoveryService({
      homeDir,
      platform: "win32"
    });

    await expect(service.scanMcpRecords()).resolves.toEqual([
      expect.objectContaining({
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        sourceLabel: "Claude Code",
        sourcePath: configPath
      })
    ]);
  });

  it("discovers Claude Desktop MCP servers from the standard macOS config path", async () => {
    const homeDir = await createTempHome();
    const configPath = path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            filesystem: {
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const service = createLibraryDiscoveryService({
      homeDir,
      platform: "darwin"
    });

    await expect(service.scanMcpRecords()).resolves.toEqual([
      expect.objectContaining({
        name: "filesystem",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        sourceLabel: "Claude Desktop",
        sourcePath: configPath
      })
    ]);
  });

  it("discovers Claude Code memory, commands, and output styles from the standard user directory", async () => {
    const homeDir = await createTempHome();
    const claudeDir = path.join(homeDir, ".claude");
    const memoryPath = path.join(claudeDir, "CLAUDE.md");
    const commandPath = path.join(claudeDir, "commands", "release.md");
    const stylePath = path.join(claudeDir, "output-styles", "concise.md");

    await fs.mkdir(path.dirname(commandPath), { recursive: true });
    await fs.mkdir(path.dirname(stylePath), { recursive: true });
    await fs.writeFile(memoryPath, "# Team memory\nUse concise answers.\n", "utf8");
    await fs.writeFile(commandPath, "---\ndescription: Release helper\n---\nShip checklist\n", "utf8");
    await fs.writeFile(stylePath, "Keep responses compact.\n", "utf8");

    const service = createLibraryDiscoveryService({
      homeDir,
      platform: "darwin"
    });

    const skills = await service.scanSkillRecords();

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "CLAUDE.md",
          sourceLabel: "Claude Code Memory",
          sourcePath: memoryPath
        }),
        expect.objectContaining({
          name: "release",
          sourceLabel: "Claude Code Command",
          sourcePath: commandPath
        }),
        expect.objectContaining({
          name: "concise",
          sourceLabel: "Claude Output Style",
          sourcePath: stylePath
        })
      ])
    );
  });
});

async function createTempHome() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claudehub-library-discovery-"));
  tempPaths.push(tempDir);
  return tempDir;
}
