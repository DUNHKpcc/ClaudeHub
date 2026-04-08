import { describe, expect, it } from "vitest";

import { configInputSchema, dependencyStatusSchema } from "../../src/shared/schemas";

describe("shared schemas", () => {
  it("accepts a valid dependency status payload", () => {
    const result = dependencyStatusSchema.safeParse({
      name: "node",
      state: "installed",
      version: "22.0.0",
      path: "/usr/local/bin/node"
    });

    expect(result.success).toBe(true);
  });

  it("rejects config payloads without an api key", () => {
    const result = configInputSchema.safeParse({
      baseUrl: "https://example.com",
      model: "gpt-4.1"
    });

    expect(result.success).toBe(false);
  });
});
