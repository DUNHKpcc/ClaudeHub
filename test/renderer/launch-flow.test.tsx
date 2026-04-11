import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";

function installApi(overrides?: Record<string, unknown>) {
  Object.defineProperty(window, "pclaude", {
    configurable: true,
    value: {
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
        ],
        platform: "darwin",
        arch: "arm64"
      }),
      readConfig: vi.fn().mockResolvedValue({
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
      getClaudeLaunchState: vi.fn().mockResolvedValue(true),
      listMcpRecords: vi.fn().mockResolvedValue([]),
      saveMcpRecord: vi.fn(),
      deleteMcpRecord: vi.fn(),
      listSkillRecords: vi.fn().mockResolvedValue([]),
      saveSkillRecord: vi.fn(),
      deleteSkillRecord: vi.fn(),
      listActivityEntries: vi.fn().mockResolvedValue([]),
      getAnthropicAdminConfig: vi.fn().mockResolvedValue({ adminKey: "" }),
      saveAnthropicAdminConfig: vi.fn(),
      getAnthropicUsage: vi.fn().mockResolvedValue({
        ok: false,
        reason: "missing_key",
        message: "Missing Anthropic Admin API key."
      }),
      ...overrides
    }
  });
}

describe("App launch flow", () => {
  beforeEach(() => {
    installApi();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "pclaude");
  });

  it("launches Claude Code from the config overview action", async () => {
    const api = window.pclaude as any;

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "启动 Claude Code" }));

    await waitFor(() => {
      expect(api.launchClaudeCode).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Claude Code 已在终端中启动。")).toBeInTheDocument();
    expect(screen.getByText("Claude Code 已在终端中启动。").closest(".metric-card")).toHaveClass("metric-card--running");
  });

  it("shows launch guidance when the environment is not ready", async () => {
    installApi({
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "missing", message: "git is missing." },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
        ],
        platform: "darwin",
        arch: "arm64"
      })
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "启动 Claude Code" }));
    expect(await screen.findByText("请先安装缺失依赖后再启动 Claude Code。")).toBeInTheDocument();
  });

  it("shows install progress records directly in the merged config page", async () => {
    let resolveInstall: ((value: { ok: boolean; steps: Array<{ name: string; state: string }> }) => void) | undefined;
    let pushProgress: ((event: { dependency: "node"; stage: "downloading"; message: string }) => void) | undefined;

    installApi({
      installMissing: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveInstall = resolve;
          })
      ),
      onInstallProgress: vi.fn().mockImplementation((listener) => {
        pushProgress = listener;
        return () => {
          pushProgress = undefined;
        };
      })
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "安装 Claude Code 与缺失依赖" }));
    pushProgress?.({
      dependency: "node",
      stage: "downloading",
      message: "Downloading node from the official source..."
    });
    resolveInstall?.({
      ok: true,
      steps: [{ name: "node", state: "completed" }]
    });

    expect((await screen.findAllByText("正在从官方源下载 Node.js...")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "安装报告" })).toBeInTheDocument();
  });

  it("falls back to a stopped status after the launched Claude session exits", async () => {
    installApi({
      getClaudeLaunchState: vi.fn().mockResolvedValueOnce(false)
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "启动 Claude Code" }));
    expect(await screen.findByText("Claude Code 已在终端中启动。")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Claude Code 已停止。")).toBeInTheDocument();
    });
    expect(screen.getByText("Claude Code 已停止。").closest(".metric-card")).not.toHaveClass("metric-card--running");
  });
});
