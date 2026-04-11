import type { ConfigInput, DependencyStatus } from "./schemas";

export interface DetectEnvironmentResult {
  dependencies: DependencyStatus[];
  platform: NodeJS.Platform;
  arch: string;
}

export type ConnectivityResult =
  | {
      ok: true;
      message: string;
    }
  | {
      ok: false;
      reason: "missing_key" | "invalid_endpoint" | "auth" | "network" | "timeout";
      message: string;
    };

export interface InstallRequest {
  dependencies: Array<"node" | "git" | "claude">;
}

export interface InstallProgressEvent {
  dependency: "node" | "git" | "claude";
  stage: "queued" | "downloading" | "installing" | "verifying" | "completed" | "failed" | "manual";
  message: string;
}

export interface InstallResult {
  ok: boolean;
  steps: Array<{
    name: "node" | "git" | "claude";
    state: "completed" | "failed";
    message?: string;
  }>;
}

export type AppSection = "config" | "mcp" | "skill" | "token";
export type DetailTab = "overview" | "settings" | "activity";
export type LibraryEntity = "mcp" | "skill";

export interface McpRecord {
  id: string;
  name: string;
  command: string;
  args: string[];
  description: string;
  enabled: boolean;
  sourceKey?: string;
  sourceLabel?: string;
  sourcePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface McpRecordInput {
  id?: string;
  name: string;
  command: string;
  args: string[];
  description: string;
  enabled: boolean;
  sourceKey?: string;
  sourceLabel?: string;
  sourcePath?: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  content: string;
  tags: string[];
  enabled: boolean;
  sourceKey?: string;
  sourceLabel?: string;
  sourcePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillRecordInput {
  id?: string;
  name: string;
  description: string;
  content: string;
  tags: string[];
  enabled: boolean;
  sourceKey?: string;
  sourceLabel?: string;
  sourcePath?: string;
}

export interface DiscoveredMcpRecord {
  id: string;
  name: string;
  command: string;
  args: string[];
  description: string;
  enabled: boolean;
  sourceKey: string;
  sourceLabel: string;
  sourcePath: string;
  imported: boolean;
}

export interface DiscoveredSkillRecord {
  id: string;
  name: string;
  description: string;
  content: string;
  tags: string[];
  enabled: boolean;
  sourceKey: string;
  sourceLabel: string;
  sourcePath: string;
  imported: boolean;
}

export interface ActivityEntry {
  id: string;
  entity: LibraryEntity;
  action: "created" | "updated" | "deleted";
  label: string;
  at: string;
  detail?: string;
}

export interface AnthropicAdminConfig {
  adminKey: string;
}

export type TokenUsageRange = "24h" | "7d" | "30d";

export interface TokenUsageRow {
  label: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface TokenUsageSource {
  kind: "local" | "official";
  status: "active" | "available" | "unavailable" | "error";
  detail: string;
}

export type AnthropicUsageResult =
  | {
      ok: true;
      range: TokenUsageRange;
      refreshedAt: string;
      primarySource: "local" | "official";
      hasCostData: boolean;
      sources: TokenUsageSource[];
      totals: {
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        totalCostUsd: number;
      };
      rows: TokenUsageRow[];
    }
  | {
      ok: false;
      reason: "missing_key" | "auth" | "permission" | "network" | "timeout" | "unsupported" | "unknown";
      message: string;
      sources?: TokenUsageSource[];
    };

export interface PClaudeApi {
  detectEnvironment(): Promise<DetectEnvironmentResult>;
  installMissing(): Promise<InstallResult>;
  onInstallProgress?(listener: (event: InstallProgressEvent) => void): () => void;
  launchClaudeCode?(): Promise<number>;
  getClaudeLaunchState?(): Promise<boolean>;
  readConfig?(): Promise<ConfigInput | null>;
  readConfigPlaceholders?(): Promise<Partial<ConfigInput> | null>;
  saveConfig(config: ConfigInput): Promise<void>;
  testConnectivity(config: ConfigInput): Promise<ConnectivityResult>;
  listMcpRecords?(): Promise<McpRecord[]>;
  scanMcpRecords?(): Promise<DiscoveredMcpRecord[]>;
  saveMcpRecord?(input: McpRecordInput): Promise<McpRecord>;
  importMcpRecord?(input: DiscoveredMcpRecord): Promise<McpRecord>;
  deleteMcpRecord?(id: string): Promise<void>;
  listSkillRecords?(): Promise<SkillRecord[]>;
  scanSkillRecords?(): Promise<DiscoveredSkillRecord[]>;
  saveSkillRecord?(input: SkillRecordInput): Promise<SkillRecord>;
  importSkillRecord?(input: DiscoveredSkillRecord): Promise<SkillRecord>;
  deleteSkillRecord?(id: string): Promise<void>;
  listActivityEntries?(entity?: LibraryEntity): Promise<ActivityEntry[]>;
  getAnthropicAdminConfig?(): Promise<AnthropicAdminConfig>;
  saveAnthropicAdminConfig?(input: AnthropicAdminConfig): Promise<AnthropicAdminConfig>;
  getAnthropicUsage?(input: { range: TokenUsageRange }): Promise<AnthropicUsageResult>;
}
