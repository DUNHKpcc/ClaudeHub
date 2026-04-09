import { BrowserWindow, app, ipcMain } from "electron";
import path from "node:path";

import { detectEnvironment } from "./services/environment";
import { saveConfig } from "./services/config";
import { testConnectivity } from "./services/connectivity";
import { buildInstallPlan, runInstallPlan } from "./services/install";
import { launchClaudeCode } from "./services/launch";
import { IPC_CHANNELS } from "../shared/ipc";

async function createWindow() {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist-electron/main/preload.js")
    }
  });

  await window.loadFile(path.join(app.getAppPath(), "dist-renderer/index.html"));
}

function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.detectEnvironment, () => detectEnvironment());
  ipcMain.handle(IPC_CHANNELS.installMissing, async (event) => {
    const environment = await detectEnvironment();
    const plan = buildInstallPlan(environment.dependencies);
    return runInstallPlan(plan, (progress) => {
      event.sender.send(IPC_CHANNELS.installProgress, progress);
    });
  });
  ipcMain.handle(IPC_CHANNELS.launchClaudeCode, () => launchClaudeCode());
  ipcMain.handle(IPC_CHANNELS.saveConfig, (_event, config) => saveConfig(config));
  ipcMain.handle(IPC_CHANNELS.testConnectivity, (_event, config) => testConnectivity(config));
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();
});
