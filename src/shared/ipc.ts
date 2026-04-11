export const APP_TITLE = "ClaudeHub";

export const IPC_CHANNELS = {
  detectEnvironment: "pclaude:detect-environment",
  installMissing: "pclaude:install-missing",
  installProgress: "pclaude:install-progress",
  launchClaudeCode: "pclaude:launch-claude-code",
  getClaudeLaunchState: "pclaude:get-launch-state",
  readConfig: "pclaude:read-config",
  readConfigPlaceholders: "pclaude:read-config-placeholders",
  saveConfig: "pclaude:save-config",
  testConnectivity: "pclaude:test-connectivity",
  listMcpRecords: "claudehub:list-mcp-records",
  scanMcpRecords: "claudehub:scan-mcp-records",
  saveMcpRecord: "claudehub:save-mcp-record",
  importMcpRecord: "claudehub:import-mcp-record",
  deleteMcpRecord: "claudehub:delete-mcp-record",
  listSkillRecords: "claudehub:list-skill-records",
  scanSkillRecords: "claudehub:scan-skill-records",
  saveSkillRecord: "claudehub:save-skill-record",
  importSkillRecord: "claudehub:import-skill-record",
  deleteSkillRecord: "claudehub:delete-skill-record",
  listActivityEntries: "claudehub:list-activity-entries",
  getAnthropicAdminConfig: "claudehub:get-anthropic-admin-config",
  saveAnthropicAdminConfig: "claudehub:save-anthropic-admin-config",
  getAnthropicUsage: "claudehub:get-anthropic-usage"
} as const;
