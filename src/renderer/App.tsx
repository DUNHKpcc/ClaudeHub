import type { CSSProperties } from "react";
import { useEffect, useState } from "react";

import { APP_TITLE } from "../shared/ipc";
import type {
  ConnectivityResult,
  DetectEnvironmentResult,
  InstallProgressEvent,
  InstallResult
} from "../shared/contracts";
import type { ConfigInput } from "../shared/schemas";

import { ConfigForm } from "./components/ConfigForm";
import { ConnectivityBanner } from "./components/ConnectivityBanner";
import { DependencyCard } from "./components/DependencyCard";
import { InstallActions } from "./components/InstallActions";

interface InstallProgressEntry extends InstallProgressEvent {
  id: string;
}

type RendererApi = Window["pclaude"] & {
  launchClaudeCode?: () => Promise<number>;
  onInstallProgress?: (listener: (event: InstallProgressEvent) => void) => () => void;
};

export function App() {
  const [environment, setEnvironment] = useState<DetectEnvironmentResult | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityResult | null>(null);
  const [installInProgress, setInstallInProgress] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgressEntry[]>([]);
  const [lastInstallResult, setLastInstallResult] = useState<InstallResult | null>(null);
  const [status, setStatus] = useState("Detecting local environment...");

  useEffect(() => {
    let cancelled = false;

    void refreshEnvironment(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const api = window.pclaude as RendererApi | undefined;

    if (!api) {
      return undefined;
    }

    return attachInstallProgressListener(api, (event) => {
      const entry = normalizeInstallProgressEvent(event);

      if (!entry) {
        return;
      }

      setInstallProgress((current) => [...current, entry].slice(-8));
      setStatus(formatInstallProgressStatus(entry));
    });
  }, []);

  async function refreshEnvironment(isCancelled?: () => boolean) {
    const api = window.pclaude as RendererApi | undefined;

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
      setStatus(isEnvironmentReady(result) ? "Environment ready" : "Environment not ready");
    } catch {
      if (!isCancelled?.()) {
        setStatus("Environment detection failed");
      }
    }
  }

  async function handleInstall() {
    const api = window.pclaude as RendererApi | undefined;

    if (!api) {
      setStatus("Install flow failed");
      return;
    }

    setInstallInProgress(true);
    setInstallProgress([]);
    setLastInstallResult(null);
    setStatus("Running install attempt...");

    try {
      const result = await api.installMissing();
      setLastInstallResult(result);
      await refreshEnvironment();
      setStatus(buildInstallStatusMessage(result));
    } catch {
      setStatus("Install flow failed");
    } finally {
      setInstallInProgress(false);
    }
  }

  async function handleLaunch() {
    const api = window.pclaude as RendererApi | undefined;

    if (!api?.launchClaudeCode) {
      setStatus("Launch flow unavailable");
      return;
    }

    setStatus("Launching Claude Code...");

    try {
      const pid = await api.launchClaudeCode();
      setStatus(`Claude Code launched with PID ${pid}.`);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Claude configuration is missing."
          ? "Save Anthropic configuration before launching Claude Code."
          : error instanceof Error && error.message
            ? error.message
            : "Launch flow failed";

      setStatus(message);
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
        <InstallActions
          launchAvailable={Boolean((window.pclaude as RendererApi | undefined)?.launchClaudeCode)}
          launchEnabled={environment !== null && isEnvironmentReady(environment) && !installInProgress}
          installInProgress={installInProgress}
          onInstall={handleInstall}
          onLaunch={handleLaunch}
        />
        {installInProgress || installProgress.length > 0 ? (
          <InstallProgressPanel entries={installProgress} running={installInProgress} />
        ) : null}
        {lastInstallResult ? <InstallReport result={lastInstallResult} /> : null}
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

function InstallReport({ result }: { result: InstallResult }) {
  return (
    <section style={reportStyle}>
      <div style={sectionHeadingStyle}>
        <h3 style={reportTitleStyle}>Latest Install Report</h3>
        <p style={sectionCopyStyle}>Review the most recent install outcome for each dependency step.</p>
      </div>
      <ul style={reportListStyle}>
        {result.steps.map((step) => (
          <li key={`${step.name}-${step.state}-${step.message ?? "none"}`} style={reportItemStyle}>
            <div style={reportHeaderStyle}>
              <span style={reportNameStyle}>{step.name}</span>
              <span style={reportStateStyle(step.state)}>{step.state}</span>
            </div>
            {step.message ? <p style={reportMessageStyle}>{step.message}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function InstallProgressPanel({ entries, running }: { entries: InstallProgressEntry[]; running: boolean }) {
  const latestEntry = entries.at(-1);

  return (
    <section style={progressPanelStyle} aria-live="polite">
      <div style={sectionHeadingStyle}>
        <h3 style={reportTitleStyle}>Install Progress</h3>
        <p style={sectionCopyStyle}>
          {running ? "The installer is running and reporting live progress." : "Recent progress events from the last install run."}
        </p>
      </div>
      <p style={progressStatusStyle}>{latestEntry ? formatInstallProgressStatus(latestEntry) : "Waiting for installer events..."}</p>
      <ul style={reportListStyle}>
        {entries.map((entry) => (
          <li key={entry.id} style={reportItemStyle}>
            <div style={reportHeaderStyle}>
              <span style={reportNameStyle}>{entry.dependency}</span>
              <span style={reportStateStyle(entry.stage)}>{entry.stage}</span>
            </div>
            <p style={reportMessageStyle}>{formatInstallProgressMessage(entry)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function isEnvironmentReady(result: DetectEnvironmentResult): boolean {
  return result.dependencies.every((dependency) => dependency.state === "installed");
}

function buildInstallStatusMessage(result: InstallResult): string {
  const stepMessages = result.steps
    .map((step) => step.message?.trim())
    .filter((message): message is string => Boolean(message));
  const suffix = formatInstallMessages(stepMessages);

  if (result.steps.length === 0) {
    return result.ok
      ? "Install attempt completed: nothing needed to change."
      : "Install attempt reported no runnable steps.";
  }

  const completedSteps = result.steps.filter((step) => step.state === "completed").length;
  const failedSteps = result.steps.filter((step) => step.state === "failed").length;

  if (failedSteps > 0) {
    return `Install attempt completed with ${completedSteps} completed step(s) and ${failedSteps} failed step(s).${suffix}`;
  }

  return `Install attempt completed successfully with ${completedSteps} completed step(s).${suffix}`;
}

function formatInstallMessages(messages: string[]): string {
  const uniqueMessages = Array.from(new Set(messages));

  if (uniqueMessages.length === 0) {
    return "";
  }

  return ` ${uniqueMessages.join(" ")}`;
}

function normalizeInstallProgressEvent(event: InstallProgressEvent): InstallProgressEntry | null {
  const message = formatInstallProgressMessage(event);
  const label = event.dependency ?? event.stage;

  if (!message && !label) {
    return null;
  }

  return {
    id: `${event.dependency}-${event.stage}-${event.message}-${Date.now()}`,
    dependency: event.dependency,
    message: event.message,
    stage: event.stage
  };
}

function formatInstallProgressMessage(event: InstallProgressEvent): string {
  return event.message.trim();
}

function formatInstallProgressStatus(entry: InstallProgressEvent): string {
  const message = formatInstallProgressMessage(entry);
  return message || "Installer progress update received.";
}

function attachInstallProgressListener(
  api: RendererApi,
  listener: (event: InstallProgressEvent) => void
): (() => void) | undefined {
  const subscribe = api.onInstallProgress;

  if (!subscribe) {
    return undefined;
  }

  return subscribe(listener);
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

const reportStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 20,
  borderRadius: 20,
  background: "rgba(15, 23, 42, 0.58)",
  border: "1px solid rgba(148, 163, 184, 0.18)"
};

const reportTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18
};

const reportListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 10
};

const reportItemStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  padding: 14,
  borderRadius: 14,
  background: "rgba(2, 6, 23, 0.42)",
  border: "1px solid rgba(148, 163, 184, 0.12)"
};

const reportHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12
};

const reportNameStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  textTransform: "capitalize"
};

function reportStateStyle(state: string): CSSProperties {
  if (state !== "completed" && state !== "failed") {
    return {
      borderRadius: 999,
      padding: "5px 10px",
      fontSize: 12,
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      background: "rgba(56, 189, 248, 0.16)",
      color: "#7dd3fc"
    };
  }

  return {
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    background: state === "completed" ? "rgba(34, 197, 94, 0.16)" : "rgba(248, 113, 113, 0.16)",
    color: state === "completed" ? "#86efac" : "#fca5a5"
  };
}

const reportMessageStyle: CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  lineHeight: 1.5
};

const progressPanelStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  padding: 20,
  borderRadius: 20,
  background: "rgba(8, 15, 34, 0.72)",
  border: "1px solid rgba(96, 165, 250, 0.22)"
};

const progressStatusStyle: CSSProperties = {
  margin: 0,
  color: "#bfdbfe",
  fontSize: 14,
  lineHeight: 1.5
};
