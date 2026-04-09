import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";

function installApi(overrides?: Partial<Window["pclaude"]>) {
  Object.defineProperty(window, "pclaude", {
    configurable: true,
    value: {
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "missing", message: "npm is missing." },
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
      launchClaudeCode: vi.fn().mockResolvedValue(4242),
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

  it("treats npm as informational when Claude is already installed", async () => {
    render(<App />);

    expect(await screen.findByText("Environment ready")).toBeInTheDocument();
    expect(screen.getByText("npm is missing.")).toBeInTheDocument();
  });

  it("launches Claude Code from the renderer when the launch action is clicked", async () => {
    const api = window.pclaude as any;

    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Launch Claude Code" }));

    await waitFor(() => {
      expect(api.launchClaudeCode).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText("Claude Code launched with PID 4242.")).toBeInTheDocument();
  });

  it("keeps launch disabled until blocking dependencies are installed", async () => {
    installApi({
      detectEnvironment: vi.fn().mockResolvedValue({
        dependencies: [
          { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
          { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
          { name: "git", state: "installed", version: "2.0.0", path: "/usr/bin/git" },
          { name: "claude", state: "missing", message: "claude is missing." }
        ],
        platform: "darwin",
        arch: "arm64"
      }),
      launchClaudeCode: vi.fn().mockResolvedValue(4242)
    });

    render(<App />);

    expect(await screen.findByText("Environment not ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Launch Claude Code" })).toBeDisabled();
  });
});
