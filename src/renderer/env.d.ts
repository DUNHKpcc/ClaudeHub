import type { PClaudeApi } from "../shared/contracts";

export {};

declare global {
  interface Window {
    pclaude: PClaudeApi;
  }
}
