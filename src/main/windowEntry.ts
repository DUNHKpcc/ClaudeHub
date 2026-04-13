import path from "node:path";

export function getPreloadPath(appPath: string) {
  return path.join(appPath, "dist-electron/main/preload.js");
}

export function resolveRendererEntry(appPath: string, env: NodeJS.ProcessEnv = process.env) {
  const devServerUrl = env.ELECTRON_RENDERER_URL?.trim();

  if (devServerUrl) {
    return {
      target: devServerUrl,
      type: "url" as const
    };
  }

  return {
    target: path.join(appPath, "dist-renderer/index.html"),
    type: "file" as const
  };
}
