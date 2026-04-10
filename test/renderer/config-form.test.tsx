import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigForm } from "../../src/renderer/components/ConfigForm";

describe("ConfigForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits the Anthropic configuration", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ConfigForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Anthropic API Key"), {
      target: { value: "sk-ant-test" }
    });
    fireEvent.change(screen.getByLabelText("模型"), {
      target: { value: "claude-sonnet-4-20250514" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(onSubmit).toHaveBeenCalledWith({
      apiKey: "sk-ant-test",
      baseUrl: "",
      model: "claude-sonnet-4-20250514"
    });
  });

  it("does not submit without an API key", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ConfigForm onSubmit={onSubmit} />);

    fireEvent.submit(screen.getByRole("button", { name: "保存配置" }).closest("form")!);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("请输入 Anthropic API Key。")).toBeInTheDocument();
  });
});
