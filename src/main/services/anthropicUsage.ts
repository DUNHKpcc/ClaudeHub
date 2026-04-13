import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AnthropicUsageResult, TokenUsageRange, TokenUsageRow, TokenUsageSource } from "../../shared/contracts";

const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicUsageServiceOptions {
  getAdminKey: () => Promise<string>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  homeDir?: string;
}

interface UsageApiResponse {
  data?: Array<{
    starting_at?: string;
    results?: Array<Record<string, unknown>>;
  }>;
}

interface ModelPricing {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
}

interface UsageRowSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const TOKENS_PER_MILLION = 1_000_000;

// Anthropic official pricing reference, checked against docs on 2026-04-12.
const MODEL_PRICING: Record<"opus" | "sonnet" | "haiku35" | "haiku3", ModelPricing> = {
  opus: {
    input: 15,
    cacheWrite5m: 18.75,
    cacheWrite1h: 30,
    cacheRead: 1.5,
    output: 75
  },
  sonnet: {
    input: 3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    cacheRead: 0.3,
    output: 15
  },
  haiku35: {
    input: 0.8,
    cacheWrite5m: 1,
    cacheWrite1h: 1.6,
    cacheRead: 0.08,
    output: 4
  },
  haiku3: {
    input: 0.25,
    cacheWrite5m: 0.3,
    cacheWrite1h: 0.5,
    cacheRead: 0.03,
    output: 1.25
  }
};

export function createAnthropicUsageService({
  getAdminKey,
  fetchImpl = fetch,
  now = () => new Date(),
  homeDir = os.homedir()
}: AnthropicUsageServiceOptions) {
  return {
    async fetchUsage({ range }: { range: TokenUsageRange }): Promise<AnthropicUsageResult> {
      const localUsage = await readLocalUsage({ homeDir, range, now });
      const adminKey = (await getAdminKey()).trim();

      if (localUsage) {
        const hasEstimatedCost = localUsage.totals.totalCostUsd > 0;

        return {
          ok: true,
          range,
          refreshedAt: now().toISOString(),
          primarySource: "local",
          hasCostData: hasEstimatedCost,
          sources: [
            {
              kind: "local",
              status: "active",
              detail: hasEstimatedCost
                ? "当前展示来自本地 Claude 日志；Cost 按 Claude 模型与 Anthropic 官方单价估算，非 Claude 模型未计价。"
                : "当前展示来自本地 Claude 日志；已统计 Token，但当前范围内没有可按 Anthropic 官方单价估算的 Claude 模型成本。"
            },
            adminKey
              ? {
                  kind: "official",
                  status: "available",
                  detail: "已配置 Anthropic Admin Key，但为避免重复计算，当前未叠加官方组织报表。"
                }
              : {
                  kind: "official",
                  status: "unavailable",
                  detail: "未配置 Anthropic Admin Key，当前未启用官方组织级成本报表。"
                }
          ],
          totals: {
            totalTokens: localUsage.totals.totalTokens,
            inputTokens: localUsage.totals.inputTokens,
            outputTokens: localUsage.totals.outputTokens,
            totalCostUsd: localUsage.totals.totalCostUsd
          },
          rows: localUsage.rows
        };
      }

      if (!adminKey) {
        return {
          ok: false,
          reason: "missing_key",
          message: "没有可用的本地 Claude 用量记录，且未配置 Anthropic Admin Key。",
          sources: [
            {
              kind: "local",
              status: "unavailable",
              detail: "当前用户目录下没有可聚合的本地 Claude token 日志。"
            },
            {
              kind: "official",
              status: "unavailable",
              detail: "未配置 Anthropic Admin Key。"
            }
          ]
        };
      }

      const { startingAt, endingAt, bucketWidth } = buildRange(range, now());
      const query = new URLSearchParams({
        starting_at: startingAt,
        ending_at: endingAt,
        bucket_width: bucketWidth
      });

      try {
        const [usageResponse, costResponse] = await Promise.all([
          fetchImpl(`https://api.anthropic.com/v1/organizations/usage_report/messages?${query.toString()}`, {
            method: "GET",
            headers: buildHeaders(adminKey)
          }),
          fetchImpl(`https://api.anthropic.com/v1/organizations/cost_report?${query.toString()}`, {
            method: "GET",
            headers: buildHeaders(adminKey)
          })
        ]);

        if (!usageResponse.ok) {
          return mapResponseError(usageResponse.status);
        }

        if (!costResponse.ok) {
          return mapResponseError(costResponse.status);
        }

        const usageJson = (await usageResponse.json()) as UsageApiResponse;
        const costJson = (await costResponse.json()) as UsageApiResponse;
        const rows = mergeRows(usageJson, costJson, bucketWidth);
        const totals = rows.reduce(
          (summary, row) => ({
            totalTokens: summary.totalTokens + row.totalTokens,
            inputTokens: summary.inputTokens + row.inputTokens,
            outputTokens: summary.outputTokens + row.outputTokens,
            totalCostUsd: roundUsd(summary.totalCostUsd + row.costUsd)
          }),
          {
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            totalCostUsd: 0
          }
        );

        return {
          ok: true,
          range,
          refreshedAt: now().toISOString(),
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
          totals,
          rows
        };
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return {
            ok: false,
            reason: "timeout",
            message: "Anthropic usage request timed out.",
            sources: [
              {
                kind: "local",
                status: "unavailable",
                detail: "当前范围内没有可用的本地 Claude token 日志。"
              },
              {
                kind: "official",
                status: "error",
                detail: "Anthropic 官方组织报表请求超时。"
              }
            ]
          };
        }

        return {
          ok: false,
          reason: "network",
          message: error instanceof Error ? error.message : "Anthropic usage request failed.",
          sources: [
            {
              kind: "local",
              status: "unavailable",
              detail: "当前范围内没有可用的本地 Claude token 日志。"
            },
            {
              kind: "official",
              status: "error",
              detail: "Anthropic 官方组织报表请求失败。"
            }
          ]
        };
      }
    }
  };
}

function buildHeaders(adminKey: string) {
  return {
    "anthropic-version": ANTHROPIC_VERSION,
    "x-api-key": adminKey
  };
}

function buildRange(range: TokenUsageRange, current: Date) {
  const endingAt = current.toISOString();

  if (range === "24h") {
    return {
      startingAt: new Date(current.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      endingAt,
      bucketWidth: "1h"
    };
  }

  if (range === "30d") {
    return {
      startingAt: new Date(current.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      endingAt,
      bucketWidth: "1d"
    };
  }

  return {
    startingAt: new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endingAt,
    bucketWidth: "1d"
  };
}

function mergeRows(usageJson: UsageApiResponse, costJson: UsageApiResponse, bucketWidth: string): TokenUsageRow[] {
  const usageMap = new Map<string, UsageRowSummary>();
  for (const bucket of usageJson.data ?? []) {
    const label = buildBucketLabel(bucket.starting_at, bucketWidth);
    const row = (bucket.results ?? []).reduce<UsageRowSummary>(
      (summary, result) => {
        const inputTokens =
          readNumber(result.input_tokens) +
          readNumber(result.input_cached_tokens) +
          readNumber(result.cache_read_input_tokens) +
          readNumber(result.cache_creation_input_tokens);
        const outputTokens = readNumber(result.output_tokens);

        return {
          inputTokens: summary.inputTokens + inputTokens,
          outputTokens: summary.outputTokens + outputTokens,
          totalTokens: summary.totalTokens + inputTokens + outputTokens
        };
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    );
    const current = usageMap.get(label) ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    usageMap.set(label, {
      inputTokens: current.inputTokens + row.inputTokens,
      outputTokens: current.outputTokens + row.outputTokens,
      totalTokens: current.totalTokens + row.totalTokens
    });
  }

  const costMap = new Map<string, number>();
  for (const bucket of costJson.data ?? []) {
    const label = buildBucketLabel(bucket.starting_at, bucketWidth);
    const amount = (bucket.results ?? []).reduce((summary, result) => {
      return summary + readNumber(result.amount_usd) + readNumber(result.cost_usd) + readAmount(result.amount);
    }, 0);
    costMap.set(label, roundUsd((costMap.get(label) ?? 0) + amount));
  }

  return Array.from(new Set([...usageMap.keys(), ...costMap.keys()]))
    .sort((left, right) => right.localeCompare(left))
    .map((label) => {
      const usage = usageMap.get(label) ?? {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };

      return {
        label,
        ...usage,
        costUsd: costMap.get(label) ?? 0
      };
    });
}

function readAmount(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const amountValue = "amount" in value ? readNumber((value as { amount?: unknown }).amount) : 0;
  const currency = "currency" in value ? String((value as { currency?: unknown }).currency ?? "") : "";
  if (currency.toLowerCase() === "usd") {
    return amountValue;
  }
  return 0;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function mapResponseError(status: number): AnthropicUsageResult {
  if (status === 401) {
    return {
      ok: false,
      reason: "auth",
      message: "Anthropic admin key authentication failed.",
      sources: buildOfficialErrorSources("Anthropic Admin Key 校验失败。")
    };
  }

  if (status === 403) {
    return {
      ok: false,
      reason: "permission",
      message: "Anthropic admin permission is required.",
      sources: buildOfficialErrorSources("当前 Anthropic 账号没有管理员权限。")
    };
  }

  if (status === 404) {
    return {
      ok: false,
      reason: "unsupported",
      message: "This Anthropic account does not expose usage reporting.",
      sources: buildOfficialErrorSources("当前 Anthropic 账号暂不支持组织级用量报表。")
    };
  }

  return {
    ok: false,
    reason: "unknown",
    message: `Anthropic usage request failed with status ${status}.`,
    sources: buildOfficialErrorSources(`Anthropic 官方组织报表返回状态 ${status}。`)
  };
}

async function readLocalUsage({
  homeDir,
  range,
  now
}: {
  homeDir: string;
  range: TokenUsageRange;
  now: () => Date;
}) {
  const projectsDir = path.join(homeDir, ".claude", "projects");
  const { startingAt, endingAt, bucketWidth } = buildRange(range, now());
  const startMs = Date.parse(startingAt);
  const endMs = Date.parse(endingAt);
  const files = await listJsonlFiles(projectsDir, startMs);
  const usageEntries = new Map<string, LocalUsageEntry>();

  for (const filePath of files) {
    const raw = await readOptionalFile(filePath);
    if (!raw) {
      continue;
    }

    for (const line of raw.split("\n")) {
      if (!line.trim()) {
        continue;
      }

      const parsed = safeParseJson(line);
      if (!parsed) {
        continue;
      }

      const timestamp = readOptionalString(parsed.timestamp);
      if (!timestamp) {
        continue;
      }

      const timestampMs = Date.parse(timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs < startMs || timestampMs > endMs) {
        continue;
      }

      const assistantEntry = readAssistantUsageEntry(parsed, bucketWidth);
      if (assistantEntry) {
        upsertLocalUsageEntry(usageEntries, assistantEntry);
      }

      const toolResultEntry = readToolResultUsageEntry(parsed, bucketWidth);
      if (toolResultEntry) {
        upsertLocalUsageEntry(usageEntries, toolResultEntry);
      }
    }
  }

  if (usageEntries.size === 0) {
    return null;
  }

  const rowsByLabel = new Map<string, LocalUsageTotals>();
  for (const entry of usageEntries.values()) {
    const current = rowsByLabel.get(entry.label) ?? emptyLocalTotals();
    rowsByLabel.set(entry.label, {
      baseInputTokens: current.baseInputTokens + entry.baseInputTokens,
      cacheReadInputTokens: current.cacheReadInputTokens + entry.cacheReadInputTokens,
      cacheCreation5mInputTokens: current.cacheCreation5mInputTokens + entry.cacheCreation5mInputTokens,
      cacheCreation1hInputTokens: current.cacheCreation1hInputTokens + entry.cacheCreation1hInputTokens,
      inputTokens: current.inputTokens + entry.inputTokens,
      outputTokens: current.outputTokens + entry.outputTokens,
      totalTokens: current.totalTokens + entry.totalTokens,
      costUsd: roundUsd(current.costUsd + entry.costUsd),
      webSearchRequests: current.webSearchRequests + entry.webSearchRequests
    });
  }

  const rows = Array.from(rowsByLabel.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([label, totals]) => ({
      label,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      totalTokens: totals.totalTokens,
      costUsd: totals.costUsd
    }));

  const totals = rows.reduce(
    (summary, row) => ({
      inputTokens: summary.inputTokens + row.inputTokens,
      outputTokens: summary.outputTokens + row.outputTokens,
      totalTokens: summary.totalTokens + row.totalTokens,
      totalCostUsd: roundUsd(summary.totalCostUsd + row.costUsd)
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalCostUsd: 0
    }
  );

  return { rows, totals };
}

interface LocalUsageEntry extends LocalUsageTotals {
  key: string;
  label: string;
}

interface LocalUsageTotals {
  baseInputTokens: number;
  cacheReadInputTokens: number;
  cacheCreation5mInputTokens: number;
  cacheCreation1hInputTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  webSearchRequests: number;
}

function readAssistantUsageEntry(parsed: Record<string, unknown>, bucketWidth: string): LocalUsageEntry | null {
  const message = isRecord(parsed.message) ? parsed.message : null;
  if (!message || readOptionalString(message.role) !== "assistant") {
    return null;
  }

  const usage = isRecord(message.usage) ? message.usage : null;
  if (!usage) {
    return null;
  }

  const sessionId = readOptionalString(parsed.sessionId) ?? "unknown-session";
  const messageId = readOptionalString(message.id) ?? readOptionalString(parsed.uuid) ?? "unknown-message";
  const timestamp = readOptionalString(parsed.timestamp);
  const model = readOptionalString(message.model);
  if (!timestamp) {
    return null;
  }

  return buildLocalUsageEntry(`assistant:${sessionId}:${messageId}`, usage, timestamp, bucketWidth, model);
}

function readToolResultUsageEntry(parsed: Record<string, unknown>, bucketWidth: string): LocalUsageEntry | null {
  const toolUseResult = isRecord(parsed.toolUseResult) ? parsed.toolUseResult : null;
  if (!toolUseResult) {
    return null;
  }

  const usage = isRecord(toolUseResult.usage) ? toolUseResult.usage : null;
  const timestamp = readOptionalString(parsed.timestamp);
  const model = readOptionalString(toolUseResult.model) ?? readOptionalString(parsed.model);
  if (!usage || !timestamp) {
    return null;
  }

  const sessionId = readOptionalString(parsed.sessionId) ?? "unknown-session";
  const agentId = readOptionalString(toolUseResult.agentId) ?? readOptionalString(parsed.uuid) ?? "unknown-tool";

  return buildLocalUsageEntry(`tool:${sessionId}:${agentId}`, usage, timestamp, bucketWidth, model);
}

function buildLocalUsageEntry(
  key: string,
  usage: Record<string, unknown>,
  timestamp: string,
  bucketWidth: string,
  model: string | null
) {
  const baseInputTokens = readNumber(usage.input_tokens);
  const cacheReadInputTokens = readNumber(usage.cache_read_input_tokens);
  const cacheCreationInputTokens = readNumber(usage.cache_creation_input_tokens);
  const cacheCreation = isRecord(usage.cache_creation) ? usage.cache_creation : null;
  const cacheCreation1hInputTokens = Math.min(
    cacheCreationInputTokens,
    readNumber(cacheCreation?.ephemeral_1h_input_tokens)
  );
  const cacheCreation5mInputTokens = Math.max(0, cacheCreationInputTokens - cacheCreation1hInputTokens);
  const inputTokens = baseInputTokens + cacheReadInputTokens + cacheCreationInputTokens;
  const outputTokens = readNumber(usage.output_tokens);
  const totalTokens = inputTokens + outputTokens;
  const webSearchRequests = isRecord(usage.server_tool_use) ? readNumber(usage.server_tool_use.web_search_requests) : 0;
  const costUsd = estimateUsageCostUsd({
    model,
    baseInputTokens,
    cacheReadInputTokens,
    cacheCreation5mInputTokens,
    cacheCreation1hInputTokens,
    outputTokens
  });

  return {
    key,
    label: buildBucketLabel(timestamp, bucketWidth),
    baseInputTokens,
    cacheReadInputTokens,
    cacheCreation5mInputTokens,
    cacheCreation1hInputTokens,
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    webSearchRequests
  };
}

function upsertLocalUsageEntry(entries: Map<string, LocalUsageEntry>, next: LocalUsageEntry) {
  const current = entries.get(next.key);

  if (!current || next.totalTokens >= current.totalTokens) {
    entries.set(next.key, next);
  }
}

function buildBucketLabel(timestamp: string | undefined, bucketWidth: string) {
  if (!timestamp) {
    return "Unknown";
  }

  const date = new Date(timestamp);
  if (bucketWidth === "1h") {
    return `${timestamp.slice(0, 13)}:00`;
  }

  return date.toISOString().slice(0, 10);
}

async function listJsonlFiles(dirPath: string, minModifiedMs: number): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const childPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          return listJsonlFiles(childPath, minModifiedMs);
        }

        if (!entry.name.endsWith(".jsonl")) {
          return [];
        }

        try {
          const stats = await fs.stat(childPath);
          return stats.mtimeMs >= minModifiedMs ? [childPath] : [];
        } catch {
          return [];
        }
      })
    );

    return files.flat();
  } catch {
    return [];
  }
}

async function readOptionalFile(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function emptyLocalTotals(): LocalUsageTotals {
  return {
    baseInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreation5mInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    webSearchRequests: 0
  };
}

function estimateUsageCostUsd({
  model,
  baseInputTokens,
  cacheReadInputTokens,
  cacheCreation5mInputTokens,
  cacheCreation1hInputTokens,
  outputTokens
}: {
  model: string | null;
  baseInputTokens: number;
  cacheReadInputTokens: number;
  cacheCreation5mInputTokens: number;
  cacheCreation1hInputTokens: number;
  outputTokens: number;
}) {
  const pricing = resolveModelPricing(model);
  if (!pricing) {
    return 0;
  }

  return roundUsd(
    (baseInputTokens / TOKENS_PER_MILLION) * pricing.input +
      (cacheReadInputTokens / TOKENS_PER_MILLION) * pricing.cacheRead +
      (cacheCreation5mInputTokens / TOKENS_PER_MILLION) * pricing.cacheWrite5m +
      (cacheCreation1hInputTokens / TOKENS_PER_MILLION) * pricing.cacheWrite1h +
      (outputTokens / TOKENS_PER_MILLION) * pricing.output
  );
}

function resolveModelPricing(model: string | null): ModelPricing | null {
  const normalized = model?.trim().toLowerCase();
  if (!normalized || !normalized.startsWith("claude-")) {
    return null;
  }

  if (normalized.includes("opus")) {
    return MODEL_PRICING.opus;
  }

  if (normalized.includes("sonnet")) {
    return MODEL_PRICING.sonnet;
  }

  if (normalized.includes("haiku-3-5") || normalized.includes("haiku-3.5")) {
    return MODEL_PRICING.haiku35;
  }

  if (normalized.includes("haiku")) {
    return MODEL_PRICING.haiku3;
  }

  return null;
}

function buildOfficialErrorSources(detail: string): TokenUsageSource[] {
  return [
    {
      kind: "local",
      status: "unavailable",
      detail: "当前范围内没有可用的本地 Claude token 日志。"
    },
    {
      kind: "official",
      status: "error",
      detail
    }
  ];
}
