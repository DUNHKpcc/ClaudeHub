import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConfigForm } from "../../src/renderer/components/ConfigForm";

describe("ConfigForm", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits the Anthropic configuration with a custom model id", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ConfigForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Anthropic API Key"), {
      target: { value: "sk-ant-test" }
    });
    fireEvent.change(screen.getByLabelText("模型 ID"), {
      target: { value: "claude-sonnet-4-5-custom" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    expect(onSubmit).toHaveBeenCalledWith({
      apiKey: "sk-ant-test",
      baseUrl: "",
      model: "claude-sonnet-4-5-custom"
    });
  });

  it("shows saved base url and model as placeholders instead of prefilling the fields", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfigForm
        placeholderValue={{
          apiKey: "sk-ant-test",
          baseUrl: "https://api.anthropic.com",
          model: "claude-enterprise-preview-2026"
        }}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText("Base URL")).toHaveValue("");
    expect(screen.getByLabelText("Base URL")).toHaveAttribute("placeholder", "https://api.anthropic.com");
    expect(screen.getByLabelText("模型 ID")).toHaveValue("");
    expect(screen.getByLabelText("模型 ID")).toHaveAttribute("placeholder", "claude-enterprise-preview-2026");
  });

  it("shows a masked placeholder for a saved API key instead of prefilling the password field", () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfigForm
        placeholderValue={{
          apiKey: "sk-ant-test-123456",
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-20250514"
        }}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText("Anthropic API Key")).toHaveValue("");
    expect(screen.getByLabelText("Anthropic API Key")).toHaveAttribute("placeholder", "sk-ant-...3456");
  });

  it("reuses the saved API key when the user saves without typing a replacement", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfigForm
        placeholderValue={{
          apiKey: "sk-ant-test",
          baseUrl: "https://api.anthropic.com",
          model: "claude-sonnet-4-20250514"
        }}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        model: "claude-sonnet-4-20250514"
      });
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
