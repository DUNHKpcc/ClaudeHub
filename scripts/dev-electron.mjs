import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const rendererUrl = "http://127.0.0.1:5173";
const mainBundlePath = path.join(rootDir, "dist-electron", "main", "index.js");
const preloadBundlePath = path.join(rootDir, "dist-electron", "main", "preload.js");
const mainOutputDir = path.dirname(mainBundlePath);
const isWindows = process.platform === "win32";
const viteBinary = path.join(rootDir, "node_modules", ".bin", isWindows ? "vite.cmd" : "vite");
const electronBinary = path.join(rootDir, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron");

const managedChildren = [];
let electronProcess = null;
let fileWatcher = null;
let isShuttingDown = false;
let restartTimer = null;
let restartQueued = false;

function spawnManaged(command, args, label) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (!isShuttingDown && code !== 0) {
      console.error(`[${label}] exited with code ${code ?? "unknown"}${signal ? ` (${signal})` : ""}`);
      shutdown(code ?? 1);
    }
  });

  managedChildren.push(child);
  return child;
}

async function waitForFile(filePath, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await fs.access(filePath);
      return;
    } catch {
      await delay(200);
    }
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForRenderer(timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(rendererUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // Renderer server is not ready yet.
    }

    await delay(200);
  }

  throw new Error(`Timed out waiting for renderer dev server at ${rendererUrl}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchElectron() {
  if (isShuttingDown) {
    return;
  }

  electronProcess = spawn(electronBinary, ["."], {
    cwd: rootDir,
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl
    },
    stdio: "inherit"
  });

  electronProcess.on("exit", () => {
    electronProcess = null;

    if (restartQueued && !isShuttingDown) {
      restartQueued = false;
      launchElectron();
    }
  });
}

function restartElectron() {
  if (isShuttingDown) {
    return;
  }

  if (!electronProcess) {
    launchElectron();
    return;
  }

  restartQueued = true;
  electronProcess.kill();
}

function scheduleRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    restartElectron();
  }, 150);
}

async function start() {
  spawnManaged(viteBinary, ["--config", "vite.renderer.config.ts", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], "renderer");
  spawnManaged(viteBinary, ["--config", "vite.main.config.ts", "build", "--watch", "--mode", "electron-main"], "main");
  spawnManaged(viteBinary, ["--config", "vite.main.config.ts", "build", "--watch", "--mode", "electron-preload"], "preload");

  await Promise.all([waitForRenderer(), waitForFile(mainBundlePath), waitForFile(preloadBundlePath)]);

  fileWatcher = (await import("node:fs")).watch(mainOutputDir, (_eventType, fileName) => {
    if (!fileName) {
      return;
    }

    const normalized = fileName.toString();

    if (normalized === "index.js" || normalized === "preload.js") {
      scheduleRestart();
    }
  });

  launchElectron();
}

function shutdown(exitCode = 0) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  fileWatcher?.close();

  if (electronProcess) {
    electronProcess.kill();
  }

  for (const child of managedChildren) {
    child.kill();
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 50).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
});
