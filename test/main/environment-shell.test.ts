import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock, execFilePromisifiedMock } = vi.hoisted(() => {
  const callbackMock = vi.fn();
  const promisifiedMock = vi.fn();
  ((callbackMock as unknown) as Record<symbol, unknown>)[Symbol.for("nodejs.util.promisify.custom")] = promisifiedMock;

  return {
    execFileMock: callbackMock,
    execFilePromisifiedMock: promisifiedMock
  };
});

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
  default: {
    execFile: execFileMock
  }
}));

import { detectBinary } from "../../src/main/services/environment";

describe("environment shell fallback", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    execFilePromisifiedMock.mockReset();
  });

  afterEach(() => {
    execFileMock.mockReset();
    execFilePromisifiedMock.mockReset();
  });

  it("detects claude through the login shell when the GUI PATH cannot find it", async () => {
    execFilePromisifiedMock.mockImplementation(async (file: string, args: string[]) => {
      if (file === "which") {
        throw Object.assign(new Error("Command failed"), {
          code: 1
        });
      }

      if (file === "/bin/zsh" && args[0] === "-ilc" && args[1]?.includes("command -v -- 'claude'")) {
        return {
          stdout: "__PCLAUDE_PATH__/Users/demo/.local/bin/claude\n"
        };
      }

      if (file === "/bin/zsh" && args[0] === "-ilc" && args[1]?.includes("'/Users/demo/.local/bin/claude' '--version'")) {
        return {
          stdout: "claude 1.2.3\n"
        };
      }

      throw new Error(`Unexpected execFile call: ${file} ${args.join(" ")}`);
    });

    const result = await detectBinary("claude", "claude", ["--version"], {
      platform: "darwin",
      shellPath: "/bin/zsh"
    });

    expect(result).toEqual({
      name: "claude",
      state: "installed",
      path: "/Users/demo/.local/bin/claude",
      version: "1.2.3",
      message: undefined
    });
  });
});
