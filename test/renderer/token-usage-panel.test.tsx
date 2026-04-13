import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TokenUsagePanel } from "../../src/renderer/components/TokenUsagePanel";

describe("TokenUsagePanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a larger sparse chart inside a consistently sized outer card", () => {
    const { container } = render(
      <TokenUsagePanel
        adminConfig={{ adminKey: "sk-ant-admin-live" }}
        range="7d"
        result={{
          ok: true,
          range: "7d",
          refreshedAt: "2026-04-10T08:00:00.000Z",
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
          totals: {
            totalTokens: 4200,
            inputTokens: 2700,
            outputTokens: 1500,
            totalCostUsd: 2.48
          },
          rows: [
            {
              label: "2026-04-11",
              inputTokens: 1500,
              outputTokens: 1000,
              totalTokens: 2500,
              costUsd: 1.36
            }
          ]
        }}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onRangeChange={vi.fn()}
        onSaveConfig={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const chart = container.querySelector<HTMLElement>(".token-chart");
    const insights = container.querySelector<HTMLElement>(".token-panel__insights");
    const sourcePanel = container.querySelector<HTMLElement>(".token-source");
    const controlsMain = container.querySelector<HTMLElement>(".token-panel__controls-main");
    const controlsActions = container.querySelector<HTMLElement>(".token-panel__actions--split");
    const hint = container.querySelector<HTMLElement>(".token-panel__hint");

    expect(screen.getByRole("heading", { name: "Token 走势" })).toBeInTheDocument();
    expect(controlsMain).not.toBeNull();
    expect(controlsActions).not.toBeNull();
    expect(hint).not.toBeNull();
    expect(insights).not.toBeNull();
    expect(insights).toHaveClass("token-panel__insights");
    expect(chart).not.toBeNull();
    expect(sourcePanel).not.toBeNull();
    expect(sourcePanel).toHaveClass("token-source");
    expect(insights).toContainElement(chart);
    expect(insights).toContainElement(sourcePanel);
    expect(chart).toHaveClass("token-chart--sparse");
    expect(chart?.querySelector(".token-chart__legend-item--primary")).not.toBeNull();
    expect(within(chart as HTMLElement).getByText("总量热度")).toBeInTheDocument();
    expect(within(sourcePanel as HTMLElement).getByRole("heading", { name: "数据来源" })).toBeInTheDocument();
    expect(sourcePanel).toHaveClass("token-source--wide");
    expect(within(chart as HTMLElement).getByText("2026-04-11")).toBeInTheDocument();
    expect(container.querySelector(".token-table")).toBeNull();
    expect(container.querySelector(".token-chart__svg")).toHaveAttribute("viewBox", "0 0 460 168");
    const bars = container.querySelectorAll(".token-chart__bar--total");
    const inputBars = container.querySelectorAll(".token-chart__bar--input");
    const outputBars = container.querySelectorAll(".token-chart__bar--output");
    const tickLabels = container.querySelectorAll(".token-chart__axis-label");

    expect(bars).toHaveLength(1);
    expect(inputBars).toHaveLength(0);
    expect(outputBars).toHaveLength(0);
    expect(bars[0]).toHaveAttribute("fill");
    expect(bars[0]).toHaveAttribute("width", "22");
    expect(tickLabels[0]).toHaveAttribute("font-size", "8");
  });

  it("keeps 30 day bars readable when one day dominates usage", () => {
    const rows = [
      {
        label: "2026-03-25",
        inputTokens: 10_000_000,
        outputTokens: 4_400_000,
        totalTokens: 14_400_000,
        costUsd: 9.2
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        label: `2026-03-${String(26 + index).padStart(2, "0")}`,
        inputTokens: 20_000,
        outputTokens: 6_800,
        totalTokens: 26_800,
        costUsd: 0.012
      }))
    ];

    const { container } = render(
      <TokenUsagePanel
        adminConfig={{ adminKey: "sk-ant-admin-live" }}
        range="30d"
        result={{
          ok: true,
          range: "30d",
          refreshedAt: "2026-04-12T00:00:00.000Z",
          primarySource: "local",
          hasCostData: true,
          sources: [
            {
              kind: "local",
              status: "active",
              detail: "当前展示来自本地 Claude 日志；Cost 按 Claude 模型与 Anthropic 官方单价估算，非 Claude 模型未计价。"
            }
          ],
          totals: {
            totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
            inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
            outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
            totalCostUsd: 9.26
          },
          rows
        }}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onRangeChange={vi.fn()}
        onSaveConfig={vi.fn().mockResolvedValue(undefined)}
      />
    );

    const chart = container.querySelector<HTMLElement>(".token-chart");
    const bars = Array.from(container.querySelectorAll<SVGRectElement>(".token-chart__bar--total"));
    const smallBarHeights = bars.slice(1).map((bar) => Number(bar.getAttribute("height") ?? "0"));

    expect(chart).not.toBeNull();
    expect(chart).not.toHaveClass("token-chart--sparse");
    expect(container.querySelector(".token-chart__svg")).toHaveAttribute("viewBox", "0 0 360 184");
    expect(Number(bars[0].getAttribute("width") ?? "0")).toBeGreaterThan(15);
    expect(Math.min(...smallBarHeights)).toBeGreaterThan(10);
  });

  it("shortens dense date labels for longer ranges", () => {
    const rows = Array.from({ length: 18 }, (_, index) => ({
      label: `2026-03-${String(index + 1).padStart(2, "0")}`,
      inputTokens: 5_000 + index * 100,
      outputTokens: 2_000 + index * 50,
      totalTokens: 7_000 + index * 150,
      costUsd: 0.01
    }));

    render(
      <TokenUsagePanel
        adminConfig={{ adminKey: "sk-ant-admin-live" }}
        range="30d"
        result={{
          ok: true,
          range: "30d",
          refreshedAt: "2026-04-12T00:00:00.000Z",
          primarySource: "local",
          hasCostData: true,
          sources: [
            {
              kind: "local",
              status: "active",
              detail: "当前展示来自本地 Claude 日志；Cost 按 Claude 模型与 Anthropic 官方单价估算，非 Claude 模型未计价。"
            }
          ],
          totals: {
            totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
            inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
            outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
            totalCostUsd: 0.18
          },
          rows
        }}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onRangeChange={vi.fn()}
        onSaveConfig={vi.fn().mockResolvedValue(undefined)}
      />
    );

    expect(screen.getByText("03/01")).toBeInTheDocument();
    expect(screen.getByText("03/17")).toBeInTheDocument();
    expect(screen.queryByText("2026-03-01")).toBeNull();
    expect(screen.queryByText("03/02")).toBeNull();
  });
});
