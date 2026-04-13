import { useEffect, useState } from "react";

import type { AnthropicAdminConfig, AnthropicUsageResult, TokenUsageRange } from "../../shared/contracts";

interface TokenUsagePanelProps {
  adminConfig: AnthropicAdminConfig;
  range: TokenUsageRange;
  result: AnthropicUsageResult | null;
  onSaveConfig: (input: AnthropicAdminConfig) => Promise<void>;
  onRefresh: (range: TokenUsageRange) => Promise<void>;
  onRangeChange: (range: TokenUsageRange) => void;
}

export function TokenUsagePanel({
  adminConfig,
  range,
  result,
  onSaveConfig,
  onRefresh,
  onRangeChange
}: TokenUsagePanelProps) {
  const [adminKey, setAdminKey] = useState(adminConfig.adminKey);

  useEffect(() => {
    setAdminKey(adminConfig.adminKey);
  }, [adminConfig.adminKey]);

  return (
    <div className="token-panel">
      <section className="token-panel__summary">
        <MetricCard label="总 Token" value={result?.ok ? formatNumber(result.totals.totalTokens) : "--"} />
        <MetricCard label="Input" value={result?.ok ? formatNumber(result.totals.inputTokens) : "--"} />
        <MetricCard label="Output" value={result?.ok ? formatNumber(result.totals.outputTokens) : "--"} />
        <MetricCard
          label="Cost"
          value={result?.ok && result.hasCostData ? formatUsd(result.totals.totalCostUsd) : "--"}
        />
      </section>

      <section className="token-panel__controls">
        <div className="token-panel__controls-main">
          <label className="field-stack">
            <span>Anthropic Admin Key（可选）</span>
            <input
              aria-label="Anthropic Admin Key"
              type="password"
              value={adminKey}
              onChange={(event) => setAdminKey(event.target.value)}
            />
          </label>
          <p className="empty-copy token-panel__hint">本地 Claude 日志会自动统计 Token；Admin Key 仅用于官方组织级报表。</p>
        </div>

        <div className="token-panel__actions token-panel__actions--split">
          <button className="primary-button" type="button" onClick={() => void onSaveConfig({ adminKey })}>
            保存 Admin Key
          </button>
          <div className="segmented-row token-panel__range">
            {(["24h", "7d", "30d"] as TokenUsageRange[]).map((option) => (
              <button
                key={option}
                className={`segment ${range === option ? "is-active" : ""}`}
                type="button"
                onClick={() => {
                  onRangeChange(option);
                  void onRefresh(option);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </section>

      {!result ? <p className="empty-copy">尚未请求用量数据。</p> : null}
      {result && !result.ok ? <p className="empty-copy">{localizeUsageError(result.reason)}</p> : null}

      {result?.ok ? (
        <section className="token-panel__insights">
          <TokenUsageChart rows={result.rows} />
          <section className="panel-card token-source token-source--wide">
            <div className="panel-card__heading">
              <h3>数据来源</h3>
              <p>{result.primarySource === "local" ? "当前展示来自本地 Claude 日志。" : "当前展示来自官方组织报表。"}</p>
            </div>
            <ul className="activity-list">
              {result.sources.map((source) => (
                <li key={source.kind} className="activity-list__item">
                  <div>
                    <p>{source.kind === "local" ? "本地 Claude 日志" : "Anthropic 官方报表"}</p>
                    <p className="empty-copy">{source.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </section>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </article>
  );
}

function TokenUsageChart({
  rows
}: {
  rows: Array<{
    label: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  }>;
}) {
  const isSparse = rows.length <= 3;
  const chartHeight = isSparse ? 168 : 184;
  const chartWidth = isSparse ? Math.max(460, rows.length * 62 + 308) : Math.max(360, rows.length * 44);
  const margin = {
    top: isSparse ? 12 : 8,
    right: 14,
    bottom: isSparse ? 34 : 34,
    left: isSparse ? 58 : 54
  };
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;
  const maxTokens = Math.max(...rows.map((row) => row.totalTokens), 1);
  const tickCount = 4;
  const step = plotWidth / Math.max(rows.length, 1);
  const barWidth = isSparse ? Math.min(22, Math.max(11, step * 0.26)) : Math.min(16, Math.max(10, step * 0.32));
  const tickValues = Array.from({ length: tickCount + 1 }, (_, index) =>
    Math.round((maxTokens * (tickCount - index)) / tickCount)
  );

  return (
    <section className={`panel-card token-chart ${isSparse ? "token-chart--sparse" : ""}`}>
      <div className="panel-card__heading">
        <h3>Token 走势</h3>
        <p>横轴为日期，纵轴为 token。单柱显示每日总量，颜色越红代表用量越高。</p>
      </div>

      <div className="token-chart__legend" aria-label="Token 图例">
        <span className="token-chart__legend-item token-chart__legend-item--primary">
          <span className="token-chart__swatch token-chart__swatch--intensity" />
          总量热度
        </span>
      </div>

      <div className={`token-chart__viewport ${isSparse ? "is-sparse" : ""}`}>
        <div className="token-chart__canvas" style={{ width: `${chartWidth}px` }}>
        <svg
          aria-label="Token 用量图表"
          className="token-chart__svg"
          preserveAspectRatio="xMidYMid meet"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          role="img"
        >
          {tickValues.map((value, index) => {
            const y = margin.top + (plotHeight / tickCount) * index;

            return (
              <g key={value}>
                <line className="token-chart__grid-line" x1={margin.left} x2={chartWidth - margin.right} y1={y} y2={y} />
                <text className="token-chart__axis-label" fontSize={isSparse ? 8 : 5} x={margin.left - 10} y={y + 4} textAnchor="end">
                  {formatNumber(value)}
                </text>
              </g>
            );
          })}

          {rows.map((row, index) => {
            const x = margin.left + step * index + (step - barWidth) / 2;
            const totalHeight = resolveBarHeight(row.totalTokens, maxTokens, plotHeight, isSparse);
            const totalY = margin.top + plotHeight - totalHeight;
            const totalLabelY = totalY - 8;
            const totalFill = getTokenHeatColor(row.totalTokens, maxTokens);
            const axisLabel = formatAxisLabel(row.label, isSparse);
            const showAxisLabel = shouldShowAxisLabel(index, rows.length, isSparse);

            return (
              <g key={row.label}>
                <title>{`${row.label} · Total ${formatNumber(row.totalTokens)}`}</title>
                <rect
                  className="token-chart__bar token-chart__bar--total"
                  fill={totalFill}
                  height={Math.max(totalHeight, 2)}
                  rx="7"
                  ry="7"
                  width={barWidth}
                  x={x}
                  y={totalY}
                />
                <text
                  className="token-chart__total-label"
                  fontSize={isSparse ? 9 : 6}
                  textAnchor="middle"
                  x={x + barWidth / 2}
                  y={Math.max(totalLabelY, 12)}
                >
                  {formatCompactNumber(row.totalTokens)}
                </text>
                <text
                  className="token-chart__axis-label"
                  fontSize={isSparse ? 8 : 5}
                  textAnchor="middle"
                  x={x + barWidth / 2}
                  y={chartHeight - 8}
                >
                  {showAxisLabel ? axisLabel : ""}
                </text>
              </g>
            );
          })}
        </svg>
        </div>
      </div>
    </section>
  );
}

function resolveBarHeight(totalTokens: number, maxTokens: number, plotHeight: number, isSparse: boolean) {
  if (maxTokens <= 0 || totalTokens <= 0) {
    return 2;
  }

  const normalized = isSparse
    ? totalTokens / maxTokens
    : Math.log1p(totalTokens) / Math.log1p(maxTokens);

  return Math.max(normalized * plotHeight, 2);
}

function formatAxisLabel(label: string, isSparse: boolean) {
  if (isSparse) {
    return label;
  }

  const matched = label.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (matched) {
    return `${matched[2]}/${matched[3]}`;
  }

  return label;
}

function shouldShowAxisLabel(index: number, total: number, isSparse: boolean) {
  if (isSparse || total <= 12) {
    return true;
  }

  if (total <= 21) {
    return index % 2 === 0 || index === total - 1;
  }

  return index % 3 === 0 || index === total - 1;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0
  }).format(value);
}

function formatUsd(value: number) {
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }

  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }

  return `$${value.toFixed(5)}`;
}

function getTokenHeatColor(totalTokens: number, maxTokens: number) {
  const normalized = Math.max(0, Math.min(1, maxTokens === 0 ? 0 : totalTokens / maxTokens));
  const hue = 195 - normalized * 195;
  const saturation = 72 + normalized * 12;
  const lightness = 54 - normalized * 10;

  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function localizeUsageError(reason: AnthropicUsageResult extends infer T
  ? T extends { ok: false; reason: infer R }
    ? R
    : never
  : never) {
  switch (reason) {
    case "missing_key":
      return "需要单独配置 Anthropic Admin Key。";
    case "auth":
      return "Anthropic Admin Key 校验失败。";
    case "permission":
      return "当前 Anthropic 账号没有管理员权限。";
    case "unsupported":
      return "当前 Anthropic 账号暂不支持用量报表。";
    case "timeout":
      return "用量请求超时，请稍后重试。";
    case "network":
      return "用量请求失败，请检查网络。";
    default:
      return "暂时无法读取用量数据。";
  }
}
