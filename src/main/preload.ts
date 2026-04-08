import { contextBridge, ipcRenderer } from "electron";

import { IPC_CHANNELS } from "../shared/ipc";
import type { PClaudeApi } from "../shared/contracts";
import { configInputSchema } from "../shared/schemas";

const api: PClaudeApi = {
  detectEnvironment: () => ipcRenderer.invoke(IPC_CHANNELS.detectEnvironment),
  saveConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.saveConfig, configInputSchema.parse(config)),
  testConnectivity: (config) =>
    ipcRenderer.invoke(IPC_CHANNELS.testConnectivity, configInputSchema.parse(config))
};

contextBridge.exposeInMainWorld("pclaude", api);
