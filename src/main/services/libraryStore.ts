import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ActivityEntry,
  AnthropicAdminConfig,
  LibraryEntity,
  McpRecord,
  McpRecordInput,
  SkillRecord,
  SkillRecordInput
} from "../../shared/contracts";

const CONFIG_DIR = path.join(os.homedir(), ".pclaude-installer");
const LIBRARY_PATH = path.join(CONFIG_DIR, "claudehub-library.json");

interface LibraryStoreFile {
  mcpRecords: McpRecord[];
  skillRecords: SkillRecord[];
  activityEntries: ActivityEntry[];
  anthropicAdminConfig: AnthropicAdminConfig;
}

const EMPTY_STORE: LibraryStoreFile = {
  mcpRecords: [],
  skillRecords: [],
  activityEntries: [],
  anthropicAdminConfig: { adminKey: "" }
};

export interface LibraryStore {
  listMcpRecords(): Promise<McpRecord[]>;
  saveMcpRecord(input: McpRecordInput): Promise<McpRecord>;
  deleteMcpRecord(id: string): Promise<void>;
  listSkillRecords(): Promise<SkillRecord[]>;
  saveSkillRecord(input: SkillRecordInput): Promise<SkillRecord>;
  deleteSkillRecord(id: string): Promise<void>;
  listActivityEntries(entity?: LibraryEntity): Promise<ActivityEntry[]>;
  getAnthropicAdminConfig(): Promise<AnthropicAdminConfig>;
  saveAnthropicAdminConfig(input: AnthropicAdminConfig): Promise<AnthropicAdminConfig>;
}

export function createLibraryStore(filePath = LIBRARY_PATH): LibraryStore {
  return {
    async listMcpRecords() {
      const store = await readStore(filePath);
      return store.mcpRecords;
    },
    async saveMcpRecord(input) {
      const store = await readStore(filePath);
      const timestamp = new Date().toISOString();
      const existing = input.id ? store.mcpRecords.find((record) => record.id === input.id) : undefined;
      const record: McpRecord = existing
        ? {
            ...existing,
            ...input,
            updatedAt: timestamp
          }
        : {
            ...input,
            id: createId(),
            createdAt: timestamp,
            updatedAt: timestamp
          };

      store.mcpRecords = upsertById(store.mcpRecords, record);
      store.activityEntries = prependActivity(store.activityEntries, {
        entity: "mcp",
        action: existing ? "updated" : "created",
        label: record.name,
        detail: record.command
      });
      await writeStore(filePath, store);
      return record;
    },
    async deleteMcpRecord(id) {
      const store = await readStore(filePath);
      const existing = store.mcpRecords.find((record) => record.id === id);
      if (!existing) {
        return;
      }

      store.mcpRecords = store.mcpRecords.filter((record) => record.id !== id);
      store.activityEntries = prependActivity(store.activityEntries, {
        entity: "mcp",
        action: "deleted",
        label: existing.name,
        detail: existing.command
      });
      await writeStore(filePath, store);
    },
    async listSkillRecords() {
      const store = await readStore(filePath);
      return store.skillRecords;
    },
    async saveSkillRecord(input) {
      const store = await readStore(filePath);
      const timestamp = new Date().toISOString();
      const existing = input.id ? store.skillRecords.find((record) => record.id === input.id) : undefined;
      const record: SkillRecord = existing
        ? {
            ...existing,
            ...input,
            updatedAt: timestamp
          }
        : {
            ...input,
            id: createId(),
            createdAt: timestamp,
            updatedAt: timestamp
          };

      store.skillRecords = upsertById(store.skillRecords, record);
      store.activityEntries = prependActivity(store.activityEntries, {
        entity: "skill",
        action: existing ? "updated" : "created",
        label: record.name,
        detail: record.description
      });
      await writeStore(filePath, store);
      return record;
    },
    async deleteSkillRecord(id) {
      const store = await readStore(filePath);
      const existing = store.skillRecords.find((record) => record.id === id);
      if (!existing) {
        return;
      }

      store.skillRecords = store.skillRecords.filter((record) => record.id !== id);
      store.activityEntries = prependActivity(store.activityEntries, {
        entity: "skill",
        action: "deleted",
        label: existing.name,
        detail: existing.description
      });
      await writeStore(filePath, store);
    },
    async listActivityEntries(entity) {
      const store = await readStore(filePath);
      const entries = entity ? store.activityEntries.filter((entry) => entry.entity === entity) : store.activityEntries;
      return [...entries].sort((left, right) => right.at.localeCompare(left.at));
    },
    async getAnthropicAdminConfig() {
      const store = await readStore(filePath);
      return store.anthropicAdminConfig;
    },
    async saveAnthropicAdminConfig(input) {
      const store = await readStore(filePath);
      store.anthropicAdminConfig = {
        adminKey: input.adminKey.trim()
      };
      await writeStore(filePath, store);
      return store.anthropicAdminConfig;
    }
  };
}

async function readStore(filePath: string): Promise<LibraryStoreFile> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LibraryStoreFile>;
    return {
      ...EMPTY_STORE,
      ...parsed,
      mcpRecords: Array.isArray(parsed.mcpRecords) ? parsed.mcpRecords : [],
      skillRecords: Array.isArray(parsed.skillRecords) ? parsed.skillRecords : [],
      activityEntries: Array.isArray(parsed.activityEntries) ? parsed.activityEntries : [],
      anthropicAdminConfig:
        parsed.anthropicAdminConfig && typeof parsed.anthropicAdminConfig === "object"
          ? {
              adminKey: typeof parsed.anthropicAdminConfig.adminKey === "string" ? parsed.anthropicAdminConfig.adminKey : ""
            }
          : { adminKey: "" }
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return structuredClone(EMPTY_STORE);
    }

    throw error;
  }
}

async function writeStore(filePath: string, store: LibraryStoreFile) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function prependActivity(
  current: ActivityEntry[],
  input: Omit<ActivityEntry, "id" | "at">
): ActivityEntry[] {
  return [
    {
      id: createId(),
      at: new Date().toISOString(),
      ...input
    },
    ...current
  ].slice(0, 100);
}

function upsertById<T extends { id: string; updatedAt: string }>(items: T[], next: T): T[] {
  const otherItems = items.filter((item) => item.id !== next.id);
  return [next, ...otherItems].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  if (error === null || typeof error !== "object") {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
