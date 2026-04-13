import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { detectEnvironment, normalizeDependencyState } from "../../src/main/services/environment";

const tempPaths: string[] = [];

describe("environment service", () => {
  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map(async (tempPath) => {
        await fs.rm(tempPath, { recursive: true, force: true });
      })
    );
  });

  it("marks a missing version as missing", () => {
    expect(normalizeDependencyState(null, "18.0.0")).toBe("missing");
  });

  it("marks an older version as outdated", () => {
    expect(normalizeDependencyState("17.9.0", "18.0.0")).toBe("outdated");
  });

  it("marks a sufficient version as installed", () => {
    expect(normalizeDependencyState("22.1.0", "18.0.0")).toBe("installed");
  });

  it("marks both marketplace dependencies as installed when official Claude Code locations contain entries", async () => {
    const homeDir = await createTempDir();
    const cwd = await createTempDir();
    const userConfigPath = path.join(homeDir, ".claude.json");
    const userSkillsDir = path.join(homeDir, ".claude", "skills", "deploy-checklist");
    const projectCommandsDir = path.join(cwd, ".claude", "commands");

    await fs.mkdir(path.dirname(userConfigPath), { recursive: true });
    await fs.mkdir(userSkillsDir, { recursive: true });
    await fs.mkdir(projectCommandsDir, { recursive: true });
    await fs.writeFile(
      userConfigPath,
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
    await fs.writeFile(path.join(userSkillsDir, "SKILL.md"), "# Deploy Checklist\n", "utf8");
    await fs.writeFile(path.join(projectCommandsDir, "release.md"), "Release helper\n", "utf8");

    const result = await detectEnvironment({
      cwd,
      arch: "arm64",
      homeDir,
      detectBinaryFn: async (name) => ({
        name,
        state: "installed",
        path: `/usr/bin/${name}`,
        version: "1.0.0"
      }),
      platform: "darwin"
    });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "mcp_market",
          state: "installed",
          version: "已检测到 1 项",
          path: "用户级 ~/.claude.json"
        }),
        expect.objectContaining({
          name: "skill_market",
          state: "installed",
          version: "已检测到 2 项",
          path: "用户级 ~/.claude/skills / 项目级 .claude/commands"
        })
      ])
    );
  });

  it("counts Claude memory and plugin skills for the skill marketplace", async () => {
    const homeDir = await createTempDir();
    const cwd = await createTempDir();
    const memoryPath = path.join(homeDir, ".claude", "CLAUDE.md");
    const pluginSkillPath = path.join(
      homeDir,
      ".claude",
      "plugins",
      "marketplaces",
      "official",
      "plugins",
      "demo-plugin",
      "skills",
      "deploy-checklist",
      "SKILL.md"
    );

    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.mkdir(path.dirname(pluginSkillPath), { recursive: true });
    await fs.writeFile(memoryPath, "# Claude memory\n", "utf8");
    await fs.writeFile(pluginSkillPath, "---\nname: deploy-checklist\n---\n", "utf8");

    const result = await detectEnvironment({
      cwd,
      arch: "arm64",
      homeDir,
      detectBinaryFn: async (name) => ({
        name,
        state: "installed",
        path: `/usr/bin/${name}`,
        version: "1.0.0"
      }),
      platform: "darwin"
    });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "skill_market",
          state: "installed",
          version: "已检测到 2 项",
          path: "用户级 ~/.claude/CLAUDE.md / 插件级 ~/.claude/plugins"
        })
      ])
    );
  });

  it("detects MCP entries from ~/.claude/settings.json", async () => {
    const homeDir = await createTempDir();
    const cwd = await createTempDir();
    const settingsPath = path.join(homeDir, ".claude", "settings.json");

    await fs.mkdir(path.dirname(settingsPath), { recursive: true });
    await fs.writeFile(
      settingsPath,
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

    const result = await detectEnvironment({
      cwd,
      arch: "arm64",
      homeDir,
      detectBinaryFn: async (name) => ({
        name,
        state: "installed",
        path: `/usr/bin/${name}`,
        version: "1.0.0"
      }),
      platform: "darwin"
    });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "mcp_market",
          state: "installed",
          version: "已检测到 1 项",
          path: "用户级 ~/.claude/settings.json"
        })
      ])
    );
  });

  it("detects MCP entries from project .claude/.mcp.json", async () => {
    const homeDir = await createTempDir();
    const cwd = await createTempDir();
    const projectConfigPath = path.join(cwd, ".claude", ".mcp.json");

    await fs.mkdir(path.dirname(projectConfigPath), { recursive: true });
    await fs.writeFile(
      projectConfigPath,
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

    const result = await detectEnvironment({
      cwd,
      arch: "arm64",
      homeDir,
      detectBinaryFn: async (name) => ({
        name,
        state: "installed",
        path: `/usr/bin/${name}`,
        version: "1.0.0"
      }),
      platform: "darwin"
    });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "mcp_market",
          state: "installed",
          version: "已检测到 1 项",
          path: "项目级 .claude/.mcp.json"
        })
      ])
    );
  });

  it("detects plugin marketplace MCP entries from plugin .mcp.json files", async () => {
    const homeDir = await createTempDir();
    const cwd = await createTempDir();
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

    const result = await detectEnvironment({
      cwd,
      arch: "arm64",
      homeDir,
      detectBinaryFn: async (name) => ({
        name,
        state: "installed",
        path: `/usr/bin/${name}`,
        version: "1.0.0"
      }),
      platform: "darwin"
    });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "mcp_market",
          state: "installed",
          version: "已检测到 1 项",
          path: "插件级 ~/.claude/plugins/marketplaces"
        })
      ])
    );
  });

  it("marks both marketplace dependencies as missing when official Claude Code locations are absent", async () => {
    const homeDir = await createTempDir();
    const cwd = await createTempDir();

    const result = await detectEnvironment({
      cwd,
      arch: "arm64",
      homeDir,
      detectBinaryFn: async (name) => ({
        name,
        state: "installed",
        path: `/usr/bin/${name}`,
        version: "1.0.0"
      }),
      platform: "darwin"
    });

    expect(result.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "mcp_market",
          state: "missing",
          version: "未检测到",
          path: "未发现"
        }),
        expect.objectContaining({
          name: "skill_market",
          state: "missing",
          version: "未检测到",
          path: "未发现"
        })
      ])
    );
  });
});

async function createTempDir() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claudehub-environment-"));
  tempPaths.push(tempDir);
  return tempDir;
}
