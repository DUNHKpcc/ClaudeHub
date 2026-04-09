import { describe, expect, it } from "vitest";

import { buildInstallPlan } from "../../src/main/services/install";

describe("install service", () => {
  it("builds an install plan from missing and outdated dependencies", () => {
    expect(
      buildInstallPlan([
        { name: "node", state: "missing" },
        { name: "npm", state: "installed" },
        { name: "git", state: "outdated" },
        { name: "claude", state: "installed" }
      ])
    ).toEqual(["node", "git"]);
  });
});
