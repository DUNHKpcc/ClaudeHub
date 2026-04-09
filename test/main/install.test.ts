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

  it("uses node as the repair step when npm is missing", () => {
    expect(
      buildInstallPlan([
        { name: "node", state: "installed" },
        { name: "npm", state: "missing" },
        { name: "git", state: "installed" },
        { name: "claude", state: "installed" }
      ])
    ).toEqual(["node"]);
  });
});
