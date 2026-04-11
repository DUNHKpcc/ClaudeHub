import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc";
import type { InstallProgressEvent, PClaudeApi } from "../shared/contracts";
import { configInputSchema } from "../shared/schemas";

const installProgressListeners = new Set<(event: InstallProgressEvent) => void>();

ipcRenderer.on(IPC_CHANNELS.installProgress, (_event, progress: InstallProgressEvent) => {
  for (const listener of installProgressListeners) {
    listener(progress);
  }
});

const api: PClaudeApi = {
  detectEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.detectEnvironment),
  installMissing: () => ipcRenderer.invoke(IPC_CHANNELS.installMissing),
  onInstallProgress: (listener) => {
    installProgressListeners.add(listener);

    return () => {
      installProgressListeners.delete(listener);
    };
  },
  launchClaudeCode: () => ipcRenderer.invoke(IPC_CHANNELS.launchClaudeCode),
  getClaudeLaunchState: () => ipcRenderer.invoke(IPC_CHANNELS.getClaudeLaunchState),
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.readConfig),
  readConfigPlaceholders: () => ipcRenderer.invoke(IPC_CHANNELS.readConfigPlaceholders),
  saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.saveConfig, configInputSchema.parse(config)),
  testConnectivity: (config) =>
    ipcRenderer.invoke(IPC_CHANNELS.testConnectivity, configInputSchema.parse(config)),
  listMcpRecords: () => ipcRenderer.invoke(IPC_CHANNELS.listMcpRecords),
  scanMcpRecords: () => ipcRenderer.invoke(IPC_CHANNELS.scanMcpRecords),
  saveMcpRecord: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveMcpRecord, input),
  importMcpRecord: (input) => ipcRenderer.invoke(IPC_CHANNELS.importMcpRecord, input),
  deleteMcpRecord: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteMcpRecord, id),
  listSkillRecords: () => ipcRenderer.invoke(IPC_CHANNELS.listSkillRecords),
  scanSkillRecords: () => ipcRenderer.invoke(IPC_CHANNELS.scanSkillRecords),
  saveSkillRecord: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveSkillRecord, input),
  importSkillRecord: (input) => ipcRenderer.invoke(IPC_CHANNELS.importSkillRecord, input),
  deleteSkillRecord: (id) => ipcRenderer.invoke(IPC_CHANNELS.deleteSkillRecord, id),
  listActivityEntries: (entity) => ipcRenderer.invoke(IPC_CHANNELS.listActivityEntries, entity),
  getAnthropicAdminConfig: () => ipcRenderer.invoke(IPC_CHANNELS.getAnthropicAdminConfig),
  saveAnthropicAdminConfig: (input) => ipcRenderer.invoke(IPC_CHANNELS.saveAnthropicAdminConfig, input),
  getAnthropicUsage: (input) => ipcRenderer.invoke(IPC_CHANNELS.getAnthropicUsage, input)
};

contextBridge.exposeInMainWorld("pclaude", api);
