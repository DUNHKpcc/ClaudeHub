import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/renderer/App";

describe("App", () => {
  beforeEach(() => {
    Object.defineProperty(window, "pclaude", {
      configurable: true,
      value: {
        detectEnvironment: vi.fn().mockResolvedValue({
          dependencies: [
            { name: "node", state: "installed", version: "20.0.0", path: "/usr/bin/node" },
            { name: "npm", state: "installed", version: "10.0.0", path: "/usr/bin/npm" },
            { name: "git", state: "missing", message: "git is missing." },
            { name: "claude", state: "installed", version: "1.0.0", path: "/usr/bin/claude" }
          ],
          platform: "darwin",
          arch: "arm64"
        }),
        saveConfig: vi.fn().mockResolvedValue(undefined),
        testConnectivity: vi.fn().mockResolvedValue({
          ok: true,
          message: "Connectivity check succeeded."
        })
      }
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "pclaude");
  });

  it("renders the installer heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "PClaude Installer" })).toBeInTheDocument();
  });

  it("shows a not-ready status when dependencies are not healthy", async () => {
    render(<App />);

    expect(await screen.findByText("Environment not ready")).toBeInTheDocument();
    expect(screen.getByText("git is missing.")).toBeInTheDocument();
  });

  it("tests connectivity before saving and surfaces save failures", async () => {
    const calls: string[] = [];
    const api = window.pclaude as any;
    api.testConnectivity = vi.fn().mockImplementation(async () => {
      calls.push("connectivity");
      return {
        ok: true,
        message: "Connectivity check succeeded."
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
});
