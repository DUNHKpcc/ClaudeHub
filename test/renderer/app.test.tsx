import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";
import type { InstallProgressEvent } from "../../src/shared/contracts";

function installApi(
  overrides?: Partial<Window["pclaude"]> & {
    launchClaudeCode?: () => Promise<number>;
    onInstallProgress?: (listener: (event: InstallProgressEvent) => void) => void | (() => void);
  }
) {
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
      saveConfig: vi.fn().mockResolvedValue(undefined),
      testConnectivity: vi.fn().mockResolvedValue({
        ok: true,
        message: "Connectivity check succeeded."
      }),
      installMissing: vi.fn().mockResolvedValue({
        ok: true,
        steps: []
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

  it("renders the installer heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "PClaude Installer" })).toBeInTheDocument();
  });

  it("renders a launch area that stays disabled until the API exposes launch", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "启动" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启动 Claude Code" })).toBeEnabled();
    expect(screen.getByText("当前版本尚未暴露启动能力。")).toBeInTheDocument();
  });

  it("renders a refresh button for rerunning environment detection", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: /检测/ })).toBeInTheDocument();
  });

  it("shows a not-ready status when npm is missing", async () => {
    installApi({
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "missing", message: "npm is missing." },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
        ],
        platform: "darwin",
        arch: "arm64"
      })
    });

    render(<App />);

    expect(await screen.findByText("环境未就绪")).toBeInTheDocument();
    expect(screen.getByText("npm 未安装。")).toBeInTheDocument();
  });

  it("shows a not-ready status when a dependency is outdated", async () => {
    installApi({
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "outdated", version: "17.9.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
        ],
        platform: "darwin",
        arch: "arm64"
      })
    });

    render(<App />);

    expect(await screen.findByText("环境未就绪")).toBeInTheDocument();
    expect(screen.getByText("版本过低")).toBeInTheDocument();
  });

  it("shows a not-ready status when a blocking dependency is missing", async () => {
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

    expect(await screen.findByText("环境未就绪")).toBeInTheDocument();
    expect(screen.getByText("Git 未安装。")).toBeInTheDocument();
  });

  it("shows macOS git guidance in the next steps panel when git is missing", async () => {
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

    expect(
      await screen.findByText("macOS 请安装 Xcode Command Line Tools 或 Homebrew Git，然后重新检测环境。")
    ).toBeInTheDocument();
    expect(screen.getByText("只有所有依赖都显示已安装后，启动按钮才会可用。")).toBeInTheDocument();
  });

  it("saves after transient connectivity failures and surfaces save failures", async () => {
    const calls: string[] = [];
    const api = window.pclaude as any;
    api.testConnectivity = vi.fn().mockImplementation(async () => {
      calls.push("connectivity");
      return {
        ok: false,
        reason: "network",
        message: "Connectivity check failed with status 503."
      };
    });
    api.saveConfig = vi.fn().mockImplementation(async () => {
      calls.push("save");
      throw new Error("save failed");
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Anthropic API Key"), {
      target: { value: "sk-ant-test" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(api.testConnectivity).toHaveBeenCalledTimes(1);
      expect(api.saveConfig).toHaveBeenCalledTimes(1);
    });

    expect(calls).toEqual(["connectivity", "save"]);
    expect(await screen.findByText("保存失败")).toBeInTheDocument();
  });

  it("does not save on auth connectivity failures", async () => {
    const api = window.pclaude as any;
    api.testConnectivity = vi.fn().mockResolvedValue({
      ok: false,
      reason: "auth",
      message: "Authentication failed. Check your API key."
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText("Anthropic API Key"), {
      target: { value: "sk-ant-test" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(api.testConnectivity).toHaveBeenCalledTimes(1);
      expect(api.saveConfig).not.toHaveBeenCalled();
    });

    expect(await screen.findByText("鉴权失败，请检查 API Key。")).toBeInTheDocument();
  });

  it("reports install outcomes using returned step states", async () => {
    installApi({
      installMissing: vi.fn().mockResolvedValue({
        ok: false,
        steps: [
          { name: "node", state: "completed" },
          { name: "git", state: "failed", message: "Manual install required for git." }
        ]
      })
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" }));

    expect(
      await screen.findByText(
        "安装结束：成功 1 项，失败 1 项。 Git 需要手动安装。"
      )
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "安装报告" })).toBeInTheDocument();
    expect(screen.getByText("Git 需要手动安装。")).toBeInTheDocument();
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);
  });

  it("omits install message suffixes when step messages are absent", async () => {
    installApi({
      installMissing: vi.fn().mockResolvedValue({
        ok: false,
        steps: [
          { name: "node", state: "completed" },
          { name: "git", state: "failed" }
        ]
      })
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" }));

    expect(await screen.findByText("安装结束：成功 1 项，失败 1 项。")).toBeInTheDocument();
  });

  it("shows live install progress updates while an install is running", async () => {
    let resolveInstall: ((value: { ok: boolean; steps: Array<{ name: string; state: string }> }) => void) | undefined;
    let pushProgress: ((event: InstallProgressEvent) => void) | undefined;

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

    const installButton = screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(installButton).toBeDisabled();
    });

    pushProgress?.({
      dependency: "node",
      stage: "downloading",
      message: "Downloading node from the official source..."
    });

    expect(await screen.findByRole("heading", { name: "安装进度" })).toBeInTheDocument();
    expect(screen.getAllByText("正在从官方源下载 Node.js...").length).toBeGreaterThan(0);
    expect(screen.getByText("下载中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "安装中…" })).toBeDisabled();

    resolveInstall?.({
      ok: true,
      steps: [{ name: "node", state: "completed" }]
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" })).toBeEnabled();
    });
  });

  it("renders the most recent install report as a step list", async () => {
    installApi({
      installMissing: vi.fn().mockResolvedValue({
        ok: true,
        steps: [
          { name: "node", state: "completed", message: "Installed node from the official source." },
          { name: "claude", state: "completed", message: "Installed claude from the official source." }
        ]
      })
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" }));

    expect(await screen.findByRole("heading", { name: "安装报告" })).toBeInTheDocument();
    expect(screen.getByText("已从官方源安装 Node.js。")).toBeInTheDocument();
    expect(screen.getByText("已从官方源安装 Claude Code。")).toBeInTheDocument();
  });

  it("shows retry guidance in next steps when an install verification fails", async () => {
    installApi({
      installMissing: vi.fn().mockResolvedValue({
        ok: false,
        steps: [
          { name: "node", state: "failed", message: "Node verification failed after installation." },
          { name: "claude", state: "completed", message: "Installed claude from the official source." }
        ]
      })
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" }));

    expect(await screen.findByText("重新执行“安装缺失依赖”以重试失败项目。")).toBeInTheDocument();
  });

  it("calls the launch API when it is present", async () => {
    const launchClaudeCode = vi.fn().mockResolvedValue(4242);
    installApi({
      launchClaudeCode,
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
        ],
        platform: "darwin",
        arch: "arm64"
      })
    });

    render(<App />);

    const launchButton = await screen.findByRole("button", { name: "启动 Claude Code" });

    expect(launchButton).toBeEnabled();

    fireEvent.click(launchButton);

    await waitFor(() => {
      expect(launchClaudeCode).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Claude Code 已启动，进程号 4242。")).toBeInTheDocument();
  });

  it("shows guidance when launch is attempted before the environment is ready", async () => {
    installApi({
      launchClaudeCode: vi.fn().mockResolvedValue(4242),
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

    expect(await screen.findByText("环境未就绪")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "启动 Claude Code" }));
    expect(await screen.findByText("请先安装缺失依赖后再启动 Claude Code。")).toBeInTheDocument();
  });

  it("surfaces a clear launch error when configuration has not been saved", async () => {
    const launchClaudeCode = vi.fn().mockRejectedValue(new Error("Claude configuration is missing."));
    installApi({
      launchClaudeCode,
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
        ],
        platform: "darwin",
        arch: "arm64"
      })
    });

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "启动 Claude Code" }));

    await waitFor(() => {
      expect(launchClaudeCode).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("请先保存 Anthropic 配置后再启动 Claude Code。")).toBeInTheDocument();
  });
});
