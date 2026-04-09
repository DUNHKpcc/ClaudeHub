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

    expect(screen.getByRole("heading", { name: "Launch Claude Code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch Claude Code" })).toBeDisabled();
    expect(
      screen.getByText("Launch will become available once the preload API exposes a launcher.")
    ).toBeInTheDocument();
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

    expect(await screen.findByText("Environment not ready")).toBeInTheDocument();
    expect(screen.getByText("npm is missing.")).toBeInTheDocument();
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

    expect(await screen.findByText("Environment not ready")).toBeInTheDocument();
    expect(screen.getByText("outdated")).toBeInTheDocument();
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

    expect(await screen.findByText("Environment not ready")).toBeInTheDocument();
    expect(screen.getByText("git is missing.")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save Configuration" }));

    await waitFor(() => {
      expect(api.testConnectivity).toHaveBeenCalledTimes(1);
      expect(api.saveConfig).toHaveBeenCalledTimes(1);
    });

    expect(calls).toEqual(["connectivity", "save"]);
    expect(await screen.findByText("save failed")).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Save Configuration" }));

    await waitFor(() => {
      expect(api.testConnectivity).toHaveBeenCalledTimes(1);
      expect(api.saveConfig).not.toHaveBeenCalled();
    });

    expect(await screen.findByText("Authentication failed. Check your API key.")).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Install Missing Dependencies" }));

    expect(
      await screen.findByText(
        "Install attempt completed with 1 completed step(s) and 1 failed step(s). Manual install required for git."
      )
    ).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Latest Install Report" })).toBeInTheDocument();
    expect(screen.getByText("Manual install required for git.")).toBeInTheDocument();
    expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0);
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

    fireEvent.click(screen.getByRole("button", { name: "Install Missing Dependencies" }));

    expect(
      await screen.findByText("Install attempt completed with 1 completed step(s) and 1 failed step(s).")
    ).toBeInTheDocument();
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

    const installButton = screen.getByRole("button", { name: "Install Missing Dependencies" });
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(installButton).toBeDisabled();
    });

    pushProgress?.({
      dependency: "node",
      stage: "downloading",
      message: "Downloading node from the official source..."
    });

    expect(await screen.findByRole("heading", { name: "Install Progress" })).toBeInTheDocument();
    expect(screen.getAllByText("Downloading node from the official source...").length).toBeGreaterThan(0);
    expect(screen.getByText("downloading")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Installing Dependencies..." })).toBeDisabled();

    resolveInstall?.({
      ok: true,
      steps: [{ name: "node", state: "completed" }]
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Install Missing Dependencies" })).toBeEnabled();
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

    fireEvent.click(screen.getByRole("button", { name: "Install Missing Dependencies" }));

    expect(await screen.findByRole("heading", { name: "Latest Install Report" })).toBeInTheDocument();
    expect(screen.getByText("Installed node from the official source.")).toBeInTheDocument();
    expect(screen.getByText("Installed claude from the official source.")).toBeInTheDocument();
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

    const launchButton = await screen.findByRole("button", { name: "Launch Claude Code" });

    expect(launchButton).toBeEnabled();

    fireEvent.click(launchButton);

    await waitFor(() => {
      expect(launchClaudeCode).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Claude Code launched with PID 4242.")).toBeInTheDocument();
  });

  it("keeps launch disabled when the environment is not ready", async () => {
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

    expect(await screen.findByText("Environment not ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch Claude Code" })).toBeDisabled();
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

    fireEvent.click(await screen.findByRole("button", { name: "Launch Claude Code" }));

    await waitFor(() => {
      expect(launchClaudeCode).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Save Anthropic configuration before launching Claude Code.")).toBeInTheDocument();
  });
});
