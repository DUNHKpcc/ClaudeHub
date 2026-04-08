import { describe, expect, it } from "vitest";

import { normalizeDependencyState } from "../../src/main/services/environment";

describe("environment service", () => {
  it("marks a missing version as missing", () => {
    expect(normalizeDependencyState(null, "18.0.0")).toBe("missing");
  });

  it("marks an older version as outdated", () => {
    expect(normalizeDependencyState("17.9.0", "18.0.0")).toBe("outdated");
  });

  it("marks a sufficient version as installed", () => {
    expect(normalizeDependencyState("22.1.0", "18.0.0")).toBe("installed");
  });
});
