import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc";
import type { PClaudeApi } from "../shared/contracts";

const api: PClaudeApi = {
  detectEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.detectEnvironment),
  saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.saveConfig, config),
  testConnectivity: (config) => ipcRenderer.invoke(IPC_CHANNELS.testConnectivity, config)
};

contextBridge.exposeInMainWorld("pclaude", api);
