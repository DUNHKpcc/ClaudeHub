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
        return {
          ok: true,
          range,
          refreshedAt: now().toISOString(),
          primarySource: "local",
          hasCostData: false,
          sources: [
            {
              kind: "local",
              status: "active",
              detail: "当前展示来自本地 Claude 日志，可覆盖官方、代理和第三方 API 的实际使用。"
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
            totalCostUsd: 0
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
        const rows = mergeRows(usageJson, costJson);
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

function mergeRows(usageJson: UsageApiResponse, costJson: UsageApiResponse): TokenUsageRow[] {
  const usageMap = new Map<string, Omit<TokenUsageRow, "costUsd">>();
  for (const bucket of usageJson.data ?? []) {
    const label = bucket.starting_at?.slice(0, 10) ?? "Unknown";
    const row = (bucket.results ?? []).reduce(
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
    usageMap.set(label, row);
  }

  const costMap = new Map<string, number>();
  for (const bucket of costJson.data ?? []) {
    const label = bucket.starting_at?.slice(0, 10) ?? "Unknown";
    const amount = (bucket.results ?? []).reduce((summary, result) => {
      return summary + readNumber(result.amount_usd) + readNumber(result.cost_usd) + readAmount(result.amount);
    }, 0);
    costMap.set(label, roundUsd(amount));
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
  return Math.round(value * 100) / 100;
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
      inputTokens: current.inputTokens + entry.inputTokens,
      outputTokens: current.outputTokens + entry.outputTokens,
      totalTokens: current.totalTokens + entry.totalTokens,
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
      costUsd: 0
    }));

  const totals = rows.reduce(
    (summary, row) => ({
      inputTokens: summary.inputTokens + row.inputTokens,
      outputTokens: summary.outputTokens + row.outputTokens,
      totalTokens: summary.totalTokens + row.totalTokens
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    }
  );

  return { rows, totals };
}

interface LocalUsageEntry extends LocalUsageTotals {
  key: string;
  label: string;
}

interface LocalUsageTotals {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
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
  if (!timestamp) {
    return null;
  }

  return buildLocalUsageEntry(`assistant:${sessionId}:${messageId}`, usage, timestamp, bucketWidth);
}

function readToolResultUsageEntry(parsed: Record<string, unknown>, bucketWidth: string): LocalUsageEntry | null {
  const toolUseResult = isRecord(parsed.toolUseResult) ? parsed.toolUseResult : null;
  if (!toolUseResult) {
    return null;
  }

  const usage = isRecord(toolUseResult.usage) ? toolUseResult.usage : null;
  const timestamp = readOptionalString(parsed.timestamp);
  if (!usage || !timestamp) {
    return null;
  }

  const sessionId = readOptionalString(parsed.sessionId) ?? "unknown-session";
  const agentId = readOptionalString(toolUseResult.agentId) ?? readOptionalString(parsed.uuid) ?? "unknown-tool";

  return buildLocalUsageEntry(`tool:${sessionId}:${agentId}`, usage, timestamp, bucketWidth);
}

function buildLocalUsageEntry(key: string, usage: Record<string, unknown>, timestamp: string, bucketWidth: string) {
  const inputTokens =
    readNumber(usage.input_tokens) +
    readNumber(usage.cache_read_input_tokens) +
    readNumber(usage.cache_creation_input_tokens);
  const outputTokens = readNumber(usage.output_tokens);
  const totalTokens = inputTokens + outputTokens;
  const webSearchRequests = isRecord(usage.server_tool_use) ? readNumber(usage.server_tool_use.web_search_requests) : 0;

  return {
    key,
    label: buildBucketLabel(timestamp, bucketWidth),
    inputTokens,
    outputTokens,
    totalTokens,
    webSearchRequests
  };
}

function upsertLocalUsageEntry(entries: Map<string, LocalUsageEntry>, next: LocalUsageEntry) {
  const current = entries.get(next.key);

  if (!current || next.totalTokens >= current.totalTokens) {
    entries.set(next.key, next);
  }
}

function buildBucketLabel(timestamp: string, bucketWidth: string) {
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
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    webSearchRequests: 0
  };
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
