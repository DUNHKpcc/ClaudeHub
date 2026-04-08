import type { ConnectivityResult } from "../../shared/contracts";
import type { ConfigInput } from "../../shared/schemas";

const DEFAULT_BASE_URL = "https://api.anthropic.com";

function buildModelsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/v1/models`;
}

export async function testConnectivity(input: ConfigInput): Promise<ConnectivityResult> {
  if (!input.apiKey.trim()) {
    return {
      ok: false,
      reason: "missing_key",
      message: "API key is required."
    };
  }

  const resolvedBaseUrl = input.baseUrl || DEFAULT_BASE_URL;

  try {
    new URL(resolvedBaseUrl);
  } catch {
    return {
      ok: false,
      reason: "invalid_endpoint",
      message: "Base URL must be a valid URL."
    };
  }

  try {
    const response = await fetch(buildModelsUrl(resolvedBaseUrl), {
      headers: {
        "x-api-key": input.apiKey,
        "anthropic-version": "2023-06-01"
      }
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: "auth",
        message: "Authentication failed. Check your API key."
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: "network",
        message: `Connectivity check failed with status ${response.status}.`
      };
    }

    return {
      ok: true,
      message: "Connectivity check succeeded."
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connectivity check failed.";

    return {
      ok: false,
      reason: "network",
      message
    };
  }
}
