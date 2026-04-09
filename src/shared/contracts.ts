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

export interface InstallResult {
  ok: boolean;
  steps: Array<{
    name: "node" | "git" | "claude";
    state: "completed" | "failed";
    message?: string;
  }>;
}

export interface PClaudeApi {
  detectEnvironment(): Promise<DetectEnvironmentResult>;
  installMissing(): Promise<InstallResult>;
  launchClaudeCode?(): Promise<number>;
  saveConfig(config: ConfigInput): Promise<void>;
  testConnectivity(config: ConfigInput): Promise<ConnectivityResult>;
}
