import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InstallActions } from "../../src/renderer/components/InstallActions";

describe("InstallActions", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders action buttons with a compact, consistent size", () => {
    render(
      <InstallActions
        onRefresh={vi.fn()}
        onInstall={vi.fn()}
        onLaunch={vi.fn()}
        launchAvailable
        launchEnabled
      />
    );

    expect(screen.getByRole("button", { name: "重新检测环境" })).toHaveStyle({
      width: "100%",
      minHeight: "40px"
    });
    expect(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" })).toHaveStyle({
      width: "100%",
      minHeight: "40px"
    });
    expect(screen.getByRole("button", { name: "启动 Claude Code" })).toHaveStyle({
      width: "100%",
      minHeight: "40px"
    });
  });

  it("uses different accent colors for refresh, install, and launch actions", () => {
    render(
      <InstallActions
        onRefresh={vi.fn()}
        onInstall={vi.fn()}
        onLaunch={vi.fn()}
        launchAvailable
        launchEnabled
      />
    );

    expect(screen.getByRole("button", { name: "重新检测环境" })).toHaveStyle({
      background: "#213544"
    });
    expect(screen.getByRole("button", { name: "安装 Claude Code 与缺失依赖" })).toHaveStyle({
      background: "#4a3223"
    });
    expect(screen.getByRole("button", { name: "启动 Claude Code" })).toHaveStyle({
      background: "#20382a"
    });
  });
});
