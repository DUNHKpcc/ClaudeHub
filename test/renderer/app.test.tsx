import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import type { InstallProgressEvent } from "../../src/shared/contracts";

function installApi(
  overrides?: Record<string, unknown> & {
    onInstallProgress?: (listener: (event: InstallProgressEvent) => void) => void | (() => void);
  }
) {
  let mcpRecords: Array<Record<string, unknown>> = [];
  let skillRecords: Array<Record<string, unknown>> = [];
  let adminConfig = { adminKey: "" };

  Object.defineProperty(window, "pclaude", {
    configurable: true,
    value: {
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" },
          { name: "mcp_market", state: "installed", version: "已配置 1 项", path: "本地发现 1 项", message: "已检测到市场配置或本地来源。" },
          { name: "skill_market", state: "installed", version: "已配置 1 项", path: "本地发现 1 项", message: "已检测到市场配置或本地来源。" }
        ],
        platform: "darwin",
        arch: "arm64"
      }),
      readConfig: vi.fn().mockResolvedValue({
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514"
      }),
      readConfigPlaceholders: vi.fn().mockResolvedValue({
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514"
      }),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      testConnectivity: vi.fn().mockResolvedValue({
        ok: true,
        message: "Connectivity check succeeded."
      }),
      installMissing: vi.fn().mockResolvedValue({
        ok: true,
        steps: []
      }),
      launchClaudeCode: vi.fn().mockResolvedValue(4242),
      listMcpRecords: vi.fn().mockImplementation(async () => mcpRecords),
      scanMcpRecords: vi.fn().mockResolvedValue([
        {
          id: "scan-mcp-1",
          name: "Filesystem Bridge",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
          description: "",
          enabled: true,
          sourceKey: "claude-desktop::filesystem",
          sourceLabel: "Claude Desktop",
          sourcePath: "/Users/demo/Library/Application Support/Claude/claude_desktop_config.json",
          imported: false
        }
      ]),
      saveMcpRecord: vi.fn().mockImplementation(async (input) => {
        const record = {
          ...input,
          id: `mcp-${mcpRecords.length + 1}`,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z"
        };
        mcpRecords = [record];
        return record;
      }),
      deleteMcpRecord: vi.fn().mockImplementation(async (id: string) => {
        mcpRecords = mcpRecords.filter((record) => record.id !== id);
      }),
      listSkillRecords: vi.fn().mockImplementation(async () => skillRecords),
      scanSkillRecords: vi.fn().mockResolvedValue([]),
      saveSkillRecord: vi.fn().mockImplementation(async (input) => {
        const record = {
          ...input,
          id: `skill-${skillRecords.length + 1}`,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z"
        };
        skillRecords = [record];
        return record;
      }),
      deleteSkillRecord: vi.fn().mockImplementation(async (id: string) => {
        skillRecords = skillRecords.filter((record) => record.id !== id);
      }),
      importMcpRecord: vi.fn().mockImplementation(async (input) => {
        const record = {
          ...input,
          id: `mcp-${mcpRecords.length + 1}`,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z"
        };
        mcpRecords = [record];
        return record;
      }),
      importSkillRecord: vi.fn().mockImplementation(async (input) => {
        const record = {
          ...input,
          id: `skill-${skillRecords.length + 1}`,
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z"
        };
        skillRecords = [record];
        return record;
      }),
      listActivityEntries: vi.fn().mockResolvedValue([]),
      getAnthropicAdminConfig: vi.fn().mockImplementation(async () => adminConfig),
      saveAnthropicAdminConfig: vi.fn().mockImplementation(async (input) => {
        adminConfig = input;
      }),
      getAnthropicUsage: vi.fn().mockResolvedValue({
        ok: false,
        reason: "missing_key",
        message: "Missing Anthropic Admin API key."
      }),
      ...overrides
    }
  });
}

describe("App", () => {
  beforeEach(() => {
    installApi();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "pclaude");
  });

  function getRail() {
    const rail = document.querySelector(".claudehub-rail");

    expect(rail).not.toBeNull();

    return rail as HTMLElement;
  }

  it("renders the fixed rail and a single-page config view without shared detail tabs", async () => {
    render(<App />);
    const rail = getRail();

    expect(screen.queryByAltText("Claude")).not.toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Config" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "MCP" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Skill" })).toBeInTheDocument();
    expect(within(rail).getByRole("button", { name: "Token 用量" })).toBeInTheDocument();

    expect(await screen.findByRole("heading", { name: "配置" })).toBeInTheDocument();
    expect(screen.getAllByText("配置界面").length).toBeGreaterThan(0);
    expect(document.querySelector(".segmented-row")).toBeNull();
    expect(screen.queryByRole("button", { name: "概览" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "活动" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Anthropic API Key")).toBeInTheDocument();
    expect(screen.getByText("环境状态")).toBeInTheDocument();
    expect(screen.getByText("已配置")).toBeInTheDocument();
    expect(screen.getByText("未安装")).toBeInTheDocument();
    expect(screen.getByText("MCP 市场")).toBeInTheDocument();
    expect(screen.getByText("Skill 市场")).toBeInTheDocument();
    expect(within(rail).getByTestId("rail-icon-config")).toBeInTheDocument();
    expect(within(rail).getByTestId("rail-icon-mcp")).toBeInTheDocument();
    expect(within(rail).getByTestId("rail-icon-skill")).toBeInTheDocument();
    expect(within(rail).getByTestId("rail-icon-token")).toBeInTheDocument();
    expect(screen.getByLabelText("Anthropic API Key").closest(".panel-card")).toHaveClass("panel-card--config");
  });

  it("switches to the MCP page and shows the shared shell with empty-state summary", async () => {
    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "MCP" }));

    expect(await screen.findByRole("heading", { name: "MCP" })).toBeInTheDocument();
    expect(screen.getByText("MCP 管理")).toBeInTheDocument();
    expect(screen.getByText("已配置 0 项")).toBeInTheDocument();
  });

  it("saves config after a transient network connectivity failure", async () => {
    const api = window.pclaude as any;
    api.testConnectivity = vi.fn().mockResolvedValue({
      ok: false,
      reason: "network",
      message: "Connectivity check failed with status 503."
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Anthropic API Key"), {
      target: { value: "sk-ant-test-updated" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(api.testConnectivity).toHaveBeenCalledTimes(1);
      expect(api.saveConfig).toHaveBeenCalledTimes(1);
    });
  });

  it("still saves config when connectivity reports authentication failure", async () => {
    const api = window.pclaude as any;
    api.testConnectivity = vi.fn().mockResolvedValue({
      ok: false,
      reason: "auth",
      message: "Authentication failed. Check your API key."
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Anthropic API Key"), {
      target: { value: "sk-ant-auth-failed" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(api.testConnectivity).toHaveBeenCalledTimes(1);
      expect(api.saveConfig).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps the saved API key when saving config without re-entering it", async () => {
    const api = window.pclaude as any;

    render(<App />);

    expect(await screen.findByLabelText("Base URL")).toHaveAttribute("placeholder", "https://api.anthropic.com");
    expect(await screen.findByLabelText("模型 ID")).toHaveAttribute("placeholder", "claude-sonnet-4-20250514");

    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(api.saveConfig).toHaveBeenCalledWith({
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514"
      });
    });
  });

  it("shows settings-derived placeholders when no app config has been saved", async () => {
    installApi({
      readConfig: vi.fn().mockResolvedValue(null),
      readConfigPlaceholders: vi.fn().mockResolvedValue({
        apiKey: "cr_test_token",
        baseUrl: "https://proxy.example.com",
        model: "claude-haiku-4-5-20251001"
      })
    });

    render(<App />);

    expect(await screen.findByLabelText("Anthropic API Key")).toHaveAttribute("placeholder", "cr_test...oken");
    expect(screen.getByLabelText("Base URL")).toHaveAttribute("placeholder", "https://proxy.example.com");
    expect(screen.getByLabelText("模型 ID")).toHaveAttribute("placeholder", "claude-haiku-4-5-20251001");
  });

  it("creates an MCP record in the merged MCP page", async () => {
    const api = window.pclaude as any;

    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "MCP" }));

    fireEvent.change(screen.getByLabelText("名称"), {
      target: { value: "Filesystem Bridge" }
    });
    fireEvent.change(screen.getByLabelText("命令"), {
      target: { value: "node" }
    });
    fireEvent.change(screen.getByLabelText("参数"), {
      target: { value: "server.js --stdio" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 MCP" }));

    await waitFor(() => {
      expect(api.saveMcpRecord).toHaveBeenCalledTimes(1);
    });

    expect((await screen.findAllByText("Filesystem Bridge")).length).toBeGreaterThan(0);
  });

  it("imports discovered MCP records from the local Claude configuration", async () => {
    const api = window.pclaude as any;

    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "MCP" }));

    expect(await screen.findByText("Claude Desktop")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入 Filesystem Bridge" }));

    await waitFor(() => {
      expect(api.importMcpRecord).toHaveBeenCalledTimes(1);
    });
  });

  it("re-scans discovered MCP records when the refresh button is clicked", async () => {
    const api = window.pclaude as any;

    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "MCP" }));

    await screen.findByText("Claude Desktop");
    expect(api.scanMcpRecords).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新扫描" }));

    await waitFor(() => {
      expect(api.scanMcpRecords).toHaveBeenCalledTimes(2);
    });
    expect(api.scanSkillRecords).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("已重新扫描本地来源。")).toBeInTheDocument();
  });

  it("imports discovered Skill records from the local Claude configuration", async () => {
    installApi({
      scanSkillRecords: vi.fn().mockResolvedValue([
        {
          id: "scan-skill-1",
          name: "feature-dev",
          description: "Build a feature safely.",
          content: "Use the feature workflow.",
          tags: ["command", "claude", "plugin"],
          enabled: true,
          sourceKey: "claude-plugin-command::feature-dev",
          sourceLabel: "Claude Plugin Command",
          sourcePath: "/Users/demo/.claude/plugins/marketplaces/claude-plugins-official/plugins/feature-dev/commands/feature-dev.md",
          imported: false
        }
      ])
    });
    const api = window.pclaude as any;

    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "Skill" }));

    expect(await screen.findByText("Claude Plugin Command")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入 feature-dev" }));

    await waitFor(() => {
      expect(api.importSkillRecord).toHaveBeenCalledTimes(1);
    });
  });

  it("shows the missing-key token state by default", async () => {
    const api = window.pclaude as any;

    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "Token 用量" }));

    expect(await screen.findByRole("heading", { name: "Token" })).toBeInTheDocument();
    expect(screen.getByText("需要单独配置 Anthropic Admin Key。")).toBeInTheDocument();
    expect(api.getAnthropicUsage).toHaveBeenCalledWith({ range: "30d" });
  });

  it("renders real token totals when Anthropic usage data is available", async () => {
    installApi({
      getAnthropicAdminConfig: vi.fn().mockResolvedValue({ adminKey: "sk-ant-admin-live" }),
      getAnthropicUsage: vi.fn().mockResolvedValue({
        ok: true,
        range: "7d",
        primarySource: "official",
        hasCostData: true,
        sources: [
          {
            kind: "local",
            status: "unavailable",
            detail: "当前范围内没有可用的本地 Claude token 日志。"
          },
          {
            kind: "official",
            status: "active",
            detail: "当前展示来自 Anthropic 官方组织报表。"
          }
        ],
        refreshedAt: "2026-04-10T08:00:00.000Z",
        totals: {
          totalTokens: 4200,
          inputTokens: 2700,
          outputTokens: 1500,
          totalCostUsd: 2.48
        },
        rows: [
          {
            label: "2026-04-09",
            inputTokens: 2700,
            outputTokens: 1500,
            totalTokens: 4200,
            costUsd: 2.48
          }
        ]
      })
    });

    render(<App />);
    const rail = getRail();

    fireEvent.click(within(rail).getByRole("button", { name: "Token 用量" }));

    expect((await screen.findAllByText("4,200")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$2.48").length).toBeGreaterThan(0);
    expect(screen.getByText("2026-04-09")).toBeInTheDocument();
  });
});
