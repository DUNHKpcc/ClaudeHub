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

  it("discovers project MCP servers from .mcp.json", async () => {
    const homeDir = await createTempHome();
    const cwd = await createTempHome();
    const configPath = path.join(cwd, ".mcp.json");

    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            ide: {
              command: "npx",
              args: ["-y", "@example/ide-mcp"]
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const service = createLibraryDiscoveryService({
      cwd,
      homeDir,
      platform: "darwin"
    });

    await expect(service.scanMcpRecords()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ide",
          command: "npx",
          args: ["-y", "@example/ide-mcp"],
          sourceLabel: "Project MCP",
          sourcePath: configPath
        })
      ])
    );
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

  it("discovers Claude plugin commands, agents, and skills from marketplace directories", async () => {
    const homeDir = await createTempHome();
    const pluginRoot = path.join(
      homeDir,
      ".claude",
      "plugins",
      "marketplaces",
      "claude-plugins-official",
      "plugins",
      "feature-dev"
    );
    const commandPath = path.join(pluginRoot, "commands", "feature-dev.md");
    const agentPath = path.join(pluginRoot, "agents", "code-reviewer.md");
    const skillPath = path.join(pluginRoot, "skills", "release-checklist", "SKILL.md");

    await fs.mkdir(path.dirname(commandPath), { recursive: true });
    await fs.mkdir(path.dirname(agentPath), { recursive: true });
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(commandPath, "---\ndescription: Build a feature safely\n---\nUse this command.\n", "utf8");
    await fs.writeFile(agentPath, "Review changes with a critical eye.\n", "utf8");
    await fs.writeFile(skillPath, "---\ndescription: Release checklist\n---\nShip carefully.\n", "utf8");

    const service = createLibraryDiscoveryService({
      homeDir,
      platform: "darwin"
    });

    const skills = await service.scanSkillRecords();

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "feature-dev",
          sourceLabel: "Claude Plugin Command",
          sourcePath: commandPath
        }),
        expect.objectContaining({
          name: "code-reviewer",
          sourceLabel: "Claude Plugin Agent",
          sourcePath: agentPath
        }),
        expect.objectContaining({
          name: "release-checklist",
          sourceLabel: "Claude Plugin Skill",
          sourcePath: skillPath
        })
      ])
    );
  });

  it("discovers plugin marketplace MCP definitions from plugin .mcp.json files", async () => {
    const homeDir = await createTempHome();
    const pluginConfigPath = path.join(
      homeDir,
      ".claude",
      "plugins",
      "marketplaces",
      "official",
      "external_plugins",
      "playwright",
      ".mcp.json"
    );

    await fs.mkdir(path.dirname(pluginConfigPath), { recursive: true });
    await fs.writeFile(
      pluginConfigPath,
      JSON.stringify(
        {
          playwright: {
            command: "npx",
            args: ["@playwright/mcp@latest"]
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

    await expect(service.scanMcpRecords()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "playwright",
          command: "npx",
          args: ["@playwright/mcp@latest"],
          sourceLabel: "Claude Plugin MCP",
          sourcePath: pluginConfigPath
        })
      ])
    );
  });

  it("discovers http MCP definitions from plugin .mcp.json files", async () => {
    const homeDir = await createTempHome();
    const pluginConfigPath = path.join(
      homeDir,
      ".claude",
      "plugins",
      "marketplaces",
      "official",
      "external_plugins",
      "github",
      ".mcp.json"
    );

    await fs.mkdir(path.dirname(pluginConfigPath), { recursive: true });
    await fs.writeFile(
      pluginConfigPath,
      JSON.stringify(
        {
          github: {
            type: "http",
            url: "https://api.githubcopilot.com/mcp/"
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

    await expect(service.scanMcpRecords()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "github",
          command: "http",
          args: ["https://api.githubcopilot.com/mcp/"],
          description: "HTTP MCP endpoint",
          sourceLabel: "Claude Plugin MCP",
          sourcePath: pluginConfigPath
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
