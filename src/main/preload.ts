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
  saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.saveConfig, configInputSchema.parse(config)),
  testConnectivity: (config) =>
    ipcRenderer.invoke(IPC_CHANNELS.testConnectivity, configInputSchema.parse(config))
};

contextBridge.exposeInMainWorld("pclaude", api);
