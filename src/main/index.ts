import { BrowserWindow, app } from "electron";
import path from "node:path";

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

app.whenReady().then(createWindow);
