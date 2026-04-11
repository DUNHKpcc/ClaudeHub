import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createLibraryStore } from "../../src/main/services/libraryStore";

const tempPaths: string[] = [];

describe("library store", () => {
  afterEach(async () => {
    await Promise.all(
      tempPaths.splice(0).map(async (tempPath) => {
        await fs.rm(tempPath, { recursive: true, force: true });
      })
    );
  });

  it("creates and lists mcp records", async () => {
    const filePath = await createTempStorePath();
    const store = createLibraryStore(filePath);

    const created = await store.saveMcpRecord({
      name: "Filesystem Bridge",
      command: "node",
      args: ["server.js", "--stdio"],
      description: "demo",
      enabled: true
    });

    const records = await store.listMcpRecords();

    expect(created.name).toBe("Filesystem Bridge");
    expect(records).toHaveLength(1);
    expect(records[0]?.command).toBe("node");
    expect(records[0]?.args).toEqual(["server.js", "--stdio"]);
  });

  it("updates skill records and keeps an activity log", async () => {
    const filePath = await createTempStorePath();
    const store = createLibraryStore(filePath);

    const created = await store.saveSkillRecord({
      name: "Release Helper",
      description: "release guide",
      content: "ship it",
      tags: ["release"],
      enabled: true
    });

    await store.saveSkillRecord({
      id: created.id,
      name: "Release Helper",
      description: "release guide v2",
      content: "ship it now",
      tags: ["release", "ops"],
      enabled: false
    });

    const skills = await store.listSkillRecords();
    const activity = await store.listActivityEntries("skill");

    expect(skills[0]?.enabled).toBe(false);
    expect(skills[0]?.tags).toEqual(["release", "ops"]);
    expect(activity.map((entry) => entry.action)).toEqual(["updated", "created"]);
  });

  it("stores and reads the anthropic admin config", async () => {
    const filePath = await createTempStorePath();
    const store = createLibraryStore(filePath);

    await store.saveAnthropicAdminConfig({ adminKey: "sk-ant-admin-123" });

    expect(await store.getAnthropicAdminConfig()).toEqual({
      adminKey: "sk-ant-admin-123"
    });
  });
});

async function createTempStorePath() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claudehub-library-store-"));
  tempPaths.push(tempDir);
  return path.join(tempDir, "library.json");
}
