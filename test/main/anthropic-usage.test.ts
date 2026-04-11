import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAnthropicUsageService } from "../../src/main/services/anthropicUsage";

describe("anthropic usage service", () => {
  afterEach(async () => {
    await fs.rm(path.join(os.tmpdir(), "pclaude-usage-tests"), { recursive: true, force: true });
  });

  it("returns missing_key when no admin key is configured", async () => {
    const homeDir = path.join(os.tmpdir(), "pclaude-usage-tests", "missing-key-home");
    await fs.mkdir(homeDir, { recursive: true });
    const service = createAnthropicUsageService({
      getAdminKey: async () => "",
      fetchImpl: vi.fn(),
      homeDir
    });

    await expect(service.fetchUsage({ range: "7d" })).resolves.toMatchObject({
      ok: false,
      reason: "missing_key"
    });
  });

  it("aggregates local Claude usage logs without requiring an Anthropic admin key", async () => {
    const homeDir = path.join(os.tmpdir(), "pclaude-usage-tests", "local-home");
    const projectDir = path.join(homeDir, ".claude", "projects", "demo-project");
    await fs.mkdir(projectDir, { recursive: true });
    await fs.writeFile(
      path.join(projectDir, "session-1.jsonl"),
      [
        JSON.stringify({
          sessionId: "session-1",
          timestamp: "2026-04-10T12:00:00.000Z",
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            usage: {
              input_tokens: 120,
              output_tokens: 0
            }
          }
        }),
        JSON.stringify({
          sessionId: "session-1",
          timestamp: "2026-04-10T12:00:01.000Z",
          type: "assistant",
          message: {
            id: "msg-1",
            role: "assistant",
            usage: {
              input_tokens: 20,
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 40,
              output_tokens: 30,
              server_tool_use: {
                web_search_requests: 2
              }
            }
          }
        }),
        JSON.stringify({
          sessionId: "session-1",
          timestamp: "2026-04-10T12:05:00.000Z",
          type: "user",
          toolUseResult: {
            agentId: "agent-1",
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_input_tokens: 15,
              cache_read_input_tokens: 0,
              server_tool_use: {
                web_search_requests: 1
              }
            }
          }
        })
      ].join("\n"),
      "utf8"
    );

    const service = createAnthropicUsageService({
      getAdminKey: async () => "",
      fetchImpl: vi.fn(),
      homeDir,
      now: () => new Date("2026-04-11T00:00:00.000Z")
    });

    const result = await service.fetchUsage({ range: "7d" });

    expect(result).toMatchObject({
      ok: true,
      primarySource: "local",
      hasCostData: false,
      totals: {
        totalTokens: 220,
        inputTokens: 185,
        outputTokens: 35,
        totalCostUsd: 0
      }
    });
    expect(result.ok && result.rows[0]).toMatchObject({
      label: "2026-04-10",
      totalTokens: 220
    });
    expect(result.ok && result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "local",
          status: "active"
        })
      ])
    );
  });

  it("normalizes usage and cost rows from the Anthropic admin APIs", async () => {
    const homeDir = path.join(os.tmpdir(), "pclaude-usage-tests", "official-home");
    await fs.mkdir(homeDir, { recursive: true });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                starting_at: "2026-04-09T00:00:00.000Z",
                ending_at: "2026-04-10T00:00:00.000Z",
                results: [
                  {
                    input_tokens: 1200,
                    output_tokens: 800
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                starting_at: "2026-04-09T00:00:00.000Z",
                ending_at: "2026-04-10T00:00:00.000Z",
                results: [
                  {
                    amount_usd: 1.25
                  }
                ]
              }
            ]
          }),
          { status: 200 }
        )
      );

    const service = createAnthropicUsageService({
      getAdminKey: async () => "sk-ant-admin-live",
      fetchImpl,
      homeDir
    });

    const result = await service.fetchUsage({ range: "7d" });

    expect(result).toMatchObject({
      ok: true,
      primarySource: "official",
      hasCostData: true,
      totals: {
        totalTokens: 2000,
        inputTokens: 1200,
        outputTokens: 800,
        totalCostUsd: 1.25
      }
    });
    expect(result.ok && result.rows[0]).toMatchObject({
      label: "2026-04-09",
      totalTokens: 2000,
      costUsd: 1.25
    });
  });

  it("maps permission failures into a stable renderer error", async () => {
    const homeDir = path.join(os.tmpdir(), "pclaude-usage-tests", "permission-home");
    await fs.mkdir(homeDir, { recursive: true });
    const service = createAnthropicUsageService({
      getAdminKey: async () => "sk-ant-admin-live",
      fetchImpl: vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })),
      homeDir
    });

    await expect(service.fetchUsage({ range: "7d" })).resolves.toMatchObject({
      ok: false,
      reason: "permission"
    });
  });
});
