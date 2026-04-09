import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { APP_TITLE } from "../shared/ipc";
import type { ConnectivityResult, DetectEnvironmentResult } from "../shared/contracts";
import type { ConfigInput } from "../shared/schemas";

import { ConfigForm } from "./components/ConfigForm";
import { ConnectivityBanner } from "./components/ConnectivityBanner";
import { DependencyCard } from "./components/DependencyCard";
import { InstallActions } from "./components/InstallActions";

const blockingDependencyNames = new Set(["node", "git", "claude"]);

export function App() {
  const [environment, setEnvironment] = useState<DetectEnvironmentResult | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityResult | null>(null);
  const [status, setStatus] = useState("Detecting local environment...");

  useEffect(() => {
    let cancelled = false;

    void refreshEnvironment(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshEnvironment(isCancelled?: () => boolean) {
    const api = window.pclaude;

    if (!api) {
      setStatus("Environment detection failed");
      return;
    }

    try {
      const result = await api.detectEnvironment();

      if (isCancelled?.()) {
        return;
      }

      setEnvironment(result);
      setStatus(hasBlockingDependency(result) ? "Environment not ready" : "Environment ready");
    } catch {
      if (!isCancelled?.()) {
        setStatus("Environment detection failed");
      }
    }
  }

  async function handleInstall() {
    const api = window.pclaude;

    if (!api) {
      setStatus("Install flow failed");
      return;
    }

    setStatus("Running install flow...");

    try {
      await api.installMissing();
      await refreshEnvironment();
      setStatus("Install flow completed");
    } catch {
      setStatus("Install flow failed");
    }
  }

  async function handleSave(input: ConfigInput) {
    try {
      const api = window.pclaude;
      if (!api) {
        throw new Error("Renderer API is unavailable.");
      }

      const result = await api.testConnectivity(input);
      setConnectivity(result);

      if (result.ok || result.reason === "network" || result.reason === "timeout") {
        await api.saveConfig(input);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save configuration.";

      setConnectivity({
        ok: false,
        reason: "network",
        message
      });
    }
  }

  return (
    <main style={mainStyle}>
      <header style={heroStyle}>
        <p style={eyebrowStyle}>Installer wizard</p>
        <h1 style={headingStyle}>{APP_TITLE}</h1>
        <p style={statusStyle}>{status}</p>
      </header>

      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <h2 style={sectionTitleStyle}>Dependencies</h2>
          <p style={sectionCopyStyle}>Check the local toolchain before saving configuration.</p>
        </div>

        <div style={gridStyle}>
          {environment?.dependencies.map((dependency) => (
            <DependencyCard key={dependency.name} dependency={dependency} />
          ))}
        </div>
        <InstallActions onInstall={handleInstall} />
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <h2 style={sectionTitleStyle}>Anthropic Configuration</h2>
          <p style={sectionCopyStyle}>Store API settings and verify the endpoint immediately.</p>
        </div>

        <div style={panelStyle}>
          <ConfigForm onSubmit={handleSave} />
          <ConnectivityBanner result={connectivity} />
        </div>
      </section>
    </main>
  );
}

function hasBlockingDependency(result: DetectEnvironmentResult): boolean {
  return result.dependencies.some(
    (dependency) => blockingDependencyNames.has(dependency.name) && dependency.state !== "installed"
  );
}

const mainStyle: CSSProperties = {
  minHeight: "100%",
  padding: 32,
  display: "grid",
  gap: 24,
  background:
    "radial-gradient(circle at top, rgba(99, 102, 241, 0.18), transparent 28%), linear-gradient(180deg, #020617 0%, #0f172a 100%)",
  color: "#e2e8f0"
};

const heroStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxWidth: 900
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#93c5fd",
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  fontSize: 12,
  fontWeight: 700
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 48,
  lineHeight: 1.05
};

const statusStyle: CSSProperties = {
  margin: 0,
  color: "#cbd5e1"
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 16
};

const sectionHeadingStyle: CSSProperties = {
  display: "grid",
  gap: 4
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22
};

const sectionCopyStyle: CSSProperties = {
  margin: 0,
  color: "#94a3b8"
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const panelStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  maxWidth: 720,
  padding: 20,
  borderRadius: 24,
  background: "rgba(15, 23, 42, 0.6)",
  border: "1px solid rgba(148, 163, 184, 0.2)"
};
