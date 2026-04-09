export const APP_TITLE = "PClaude Installer";

export const IPC_CHANNELS = {
  detectEnvironment: "pclaude:detect-environment",
  installMissing: "pclaude:install-missing",
  saveConfig: "pclaude:save-config",
  testConnectivity: "pclaude:test-connectivity"
} as const;
