import { BrowserWindow, app, ipcMain } from "electron";

import { detectEnvironment } from "./services/environment";
import { readConfig, readConfigPlaceholders, saveConfig } from "./services/config";
import { testConnectivity } from "./services/connectivity";
import { buildInstallPlan, runInstallPlan } from "./services/install";
import { cleanupLaunchedClaudeCode, getClaudeLaunchState, launchClaudeCode } from "./services/launch";
import { IPC_CHANNELS } from "../shared/ipc";
import { createLibraryStore } from "./services/libraryStore";
import { createAnthropicUsageService } from "./services/anthropicUsage";
import { createLibraryDiscoveryService } from "./services/libraryDiscovery";
import type {
  DiscoveredMcpRecord,
  DiscoveredSkillRecord,
  McpRecord,
  SkillRecord
} from "../shared/contracts";
import { getPreloadPath, resolveRendererEntry } from "./windowEntry";

async function createWindow() {
  const appPath = app.getAppPath();
  const rendererEntry = resolveRendererEntry(appPath);
  const window = new BrowserWindow({
    width: 1088,
    height: 860,
    minWidth: 918,
    minHeight: 760,
    backgroundColor: "#1f1f21",
    webPreferences: {
      preload: getPreloadPath(appPath)
    }
  });

  if (rendererEntry.type === "url") {
    await window.loadURL(rendererEntry.target);
    return;
  }

  await window.loadFile(rendererEntry.target);
}

function registerIpcHandlers() {
  const libraryStore = createLibraryStore();
  const libraryDiscovery = createLibraryDiscoveryService();
  const anthropicUsageService = createAnthropicUsageService({
    getAdminKey: async () => {
      const config = await libraryStore.getAnthropicAdminConfig();
      return config.adminKey;
    }
  });

  ipcMain.handle(IPC_CHANNELS.detectEnvironment, () => detectEnvironment());
  ipcMain.handle(IPC_CHANNELS.installMissing, async (event) => {
    const environment = await detectEnvironment();
    const plan = buildInstallPlan(environment.dependencies);
    return runInstallPlan(plan, (progress) => {
      event.sender.send(IPC_CHANNELS.installProgress, progress);
    });
  });
  ipcMain.handle(IPC_CHANNELS.launchClaudeCode, () => launchClaudeCode());
  ipcMain.handle(IPC_CHANNELS.getClaudeLaunchState, () => getClaudeLaunchState());
  ipcMain.handle(IPC_CHANNELS.readConfig, () => readConfig());
  ipcMain.handle(IPC_CHANNELS.readConfigPlaceholders, () => readConfigPlaceholders());
  ipcMain.handle(IPC_CHANNELS.saveConfig, (_event, config) => saveConfig(config));
  ipcMain.handle(IPC_CHANNELS.testConnectivity, (_event, config) => testConnectivity(config));
  ipcMain.handle(IPC_CHANNELS.listMcpRecords, () => libraryStore.listMcpRecords());
  ipcMain.handle(IPC_CHANNELS.scanMcpRecords, async () => {
    const [records, discovered] = await Promise.all([
      libraryStore.listMcpRecords(),
      libraryDiscovery.scanMcpRecords()
    ]);
    return discovered.map((item) => ({
      ...item,
      imported: hasImportedMcpRecord(records, item)
    }));
  });
  ipcMain.handle(IPC_CHANNELS.saveMcpRecord, (_event, input) => libraryStore.saveMcpRecord(input));
  ipcMain.handle(IPC_CHANNELS.importMcpRecord, async (_event, input: DiscoveredMcpRecord) => {
    const records = await libraryStore.listMcpRecords();
    const existing = resolveImportedMcpRecord(records, input);
    return libraryStore.saveMcpRecord({
      id: existing?.id,
      name: input.name,
      command: input.command,
      args: input.args,
      description: input.description,
      enabled: input.enabled,
      sourceKey: input.sourceKey,
      sourceLabel: input.sourceLabel,
      sourcePath: input.sourcePath
    });
  });
  ipcMain.handle(IPC_CHANNELS.deleteMcpRecord, (_event, id) => libraryStore.deleteMcpRecord(id));
  ipcMain.handle(IPC_CHANNELS.listSkillRecords, () => libraryStore.listSkillRecords());
  ipcMain.handle(IPC_CHANNELS.scanSkillRecords, async () => {
    const [records, discovered] = await Promise.all([
      libraryStore.listSkillRecords(),
      libraryDiscovery.scanSkillRecords()
    ]);
    return discovered.map((item) => ({
      ...item,
      imported: hasImportedSkillRecord(records, item)
    }));
  });
  ipcMain.handle(IPC_CHANNELS.saveSkillRecord, (_event, input) => libraryStore.saveSkillRecord(input));
  ipcMain.handle(IPC_CHANNELS.importSkillRecord, async (_event, input: DiscoveredSkillRecord) => {
    const records = await libraryStore.listSkillRecords();
    const existing = resolveImportedSkillRecord(records, input);
    return libraryStore.saveSkillRecord({
      id: existing?.id,
      name: input.name,
      description: input.description,
      content: input.content,
      tags: input.tags,
      enabled: input.enabled,
      sourceKey: input.sourceKey,
      sourceLabel: input.sourceLabel,
      sourcePath: input.sourcePath
    });
  });
  ipcMain.handle(IPC_CHANNELS.deleteSkillRecord, (_event, id) => libraryStore.deleteSkillRecord(id));
  ipcMain.handle(IPC_CHANNELS.listActivityEntries, (_event, entity) => libraryStore.listActivityEntries(entity));
  ipcMain.handle(IPC_CHANNELS.getAnthropicAdminConfig, () => libraryStore.getAnthropicAdminConfig());
  ipcMain.handle(IPC_CHANNELS.saveAnthropicAdminConfig, (_event, input) => libraryStore.saveAnthropicAdminConfig(input));
  ipcMain.handle(IPC_CHANNELS.getAnthropicUsage, (_event, input) => anthropicUsageService.fetchUsage(input));
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();
});

app.on("before-quit", () => {
  void cleanupLaunchedClaudeCode();
});

function hasImportedMcpRecord(records: McpRecord[], input: DiscoveredMcpRecord) {
  return Boolean(resolveImportedMcpRecord(records, input));
}

function resolveImportedMcpRecord(records: McpRecord[], input: DiscoveredMcpRecord) {
  return records.find(
    (record) =>
      record.sourceKey === input.sourceKey ||
      (record.name === input.name &&
        record.command === input.command &&
        JSON.stringify(record.args) === JSON.stringify(input.args))
  );
}

function hasImportedSkillRecord(records: SkillRecord[], input: DiscoveredSkillRecord) {
  return Boolean(resolveImportedSkillRecord(records, input));
}

function resolveImportedSkillRecord(records: SkillRecord[], input: DiscoveredSkillRecord) {
  return records.find(
    (record) =>
      record.sourceKey === input.sourceKey ||
      (record.name === input.name && record.content === input.content)
  );
}
