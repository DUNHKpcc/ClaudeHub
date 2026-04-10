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
import {
  localizeDependencyName,
  localizeInstallStage,
  localizeInstallState,
  localizeMessage
} from "./lib/ui-copy";

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
  const [environmentRefreshing, setEnvironmentRefreshing] = useState(false);
  const [installInProgress, setInstallInProgress] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgressEntry[]>([]);
  const [lastInstallResult, setLastInstallResult] = useState<InstallResult | null>(null);
  const [status, setStatus] = useState("正在检测本机环境…");

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
      setStatus("环境检测失败");
      return;
    }

    setEnvironmentRefreshing(true);

    try {
      const result = await api.detectEnvironment();

      if (isCancelled?.()) {
        return;
      }

      setEnvironment(result);
      setStatus(isEnvironmentReady(result) ? "环境已就绪" : "环境未就绪");
    } catch {
      if (!isCancelled?.()) {
        setStatus("环境检测失败");
      }
    } finally {
      if (!isCancelled?.()) {
        setEnvironmentRefreshing(false);
      }
    }
  }

  async function handleRefresh() {
    setStatus("正在重新检测环境…");
    await refreshEnvironment();
  }

  async function handleInstall() {
    const api = window.pclaude as RendererApi | undefined;

    if (!api) {
      setStatus("安装流程失败");
      return;
    }

    setInstallInProgress(true);
    setInstallProgress([]);
    setLastInstallResult(null);
    setStatus("正在执行安装…");

    try {
      const result = await api.installMissing();
      setLastInstallResult(result);
      await refreshEnvironment();
      setStatus(buildInstallStatusMessage(result));
    } catch {
      setStatus("安装流程失败");
    } finally {
      setInstallInProgress(false);
    }
  }

  async function handleLaunch() {
    const api = window.pclaude as RendererApi | undefined;

    if (!environment) {
      setStatus("请先重新检测环境。");
      return;
    }

    if (!isEnvironmentReady(environment)) {
      setStatus("请先安装缺失依赖后再启动 Claude Code。");
      return;
    }

    if (!api?.launchClaudeCode) {
      setStatus("当前版本暂不支持启动");
      return;
    }

    setStatus("正在启动 Claude Code…");

    try {
      const pid = await api.launchClaudeCode();
      setStatus(`Claude Code 已启动，进程号 ${pid}。`);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Claude configuration is missing."
          ? "请先保存 Anthropic 配置后再启动 Claude Code。"
          : error instanceof Error && error.message
            ? localizeMessage(error.message)
            : "启动流程失败";

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
        message: localizeMessage(message)
      });
    }
  }

  return (
    <main style={mainStyle}>
      <header style={heroStyle}>
        <p style={eyebrowStyle}>本地安装器</p>
        <h1 style={headingStyle}>{APP_TITLE}</h1>
        <p style={statusStyle}>{status}</p>
      </header>

      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <h2 style={sectionTitleStyle}>环境依赖</h2>
          <p style={sectionCopyStyle}>安装前先确认本机工具链状态。</p>
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
          refreshInProgress={environmentRefreshing}
          onRefresh={handleRefresh}
          onInstall={handleInstall}
          onLaunch={handleLaunch}
        />
        {installInProgress || installProgress.length > 0 ? (
          <InstallProgressPanel entries={installProgress} running={installInProgress} />
        ) : null}
        {lastInstallResult ? <InstallReport result={lastInstallResult} /> : null}
        <NextStepsPanel
          connectivity={connectivity}
          environment={environment}
          installInProgress={installInProgress}
          installResult={lastInstallResult}
          status={status}
        />
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeadingStyle}>
          <h2 style={sectionTitleStyle}>Anthropic 配置</h2>
          <p style={sectionCopyStyle}>保存 API 参数并立即校验连通性。</p>
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
        <h3 style={reportTitleStyle}>安装报告</h3>
        <p style={sectionCopyStyle}>最近一次安装结果。</p>
      </div>
      <ul style={reportListStyle}>
        {result.steps.map((step) => (
          <li key={`${step.name}-${step.state}-${step.message ?? "none"}`} style={reportItemStyle}>
            <div style={reportHeaderStyle}>
              <span style={reportNameStyle}>{localizeDependencyName(step.name)}</span>
              <span style={reportStateStyle(step.state)}>{localizeInstallState(step.state)}</span>
            </div>
            {step.message ? <p style={reportMessageStyle}>{localizeMessage(step.message)}</p> : null}
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
        <h3 style={reportTitleStyle}>安装进度</h3>
        <p style={sectionCopyStyle}>{running ? "正在执行安装任务。" : "展示最近一次安装的进度记录。"}</p>
      </div>
      <p style={progressStatusStyle}>{latestEntry ? formatInstallProgressStatus(latestEntry) : "等待安装事件…"}</p>
      <ul style={reportListStyle}>
        {entries.map((entry) => (
          <li key={entry.id} style={reportItemStyle}>
            <div style={reportHeaderStyle}>
              <span style={reportNameStyle}>{localizeDependencyName(entry.dependency)}</span>
              <span style={reportStateStyle(entry.stage)}>{localizeInstallStage(entry.stage)}</span>
            </div>
            <p style={reportMessageStyle}>{formatInstallProgressMessage(entry)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NextStepsPanel({
  connectivity,
  environment,
  installInProgress,
  installResult,
  status
}: {
  connectivity: ConnectivityResult | null;
  environment: DetectEnvironmentResult | null;
  installInProgress: boolean;
  installResult: InstallResult | null;
  status: string;
}) {
  const steps = buildNextSteps({
    connectivity,
    environment,
    installInProgress,
    installResult,
    status
  });

  if (steps.length === 0) {
    return null;
  }

  return (
    <section style={reportStyle}>
      <div style={sectionHeadingStyle}>
        <h3 style={reportTitleStyle}>下一步</h3>
        <p style={sectionCopyStyle}>根据当前状态继续处理。</p>
      </div>
      <ul style={reportListStyle}>
        {steps.map((step) => (
          <li key={step} style={reportItemStyle}>
            <p style={reportMessageStyle}>{step}</p>
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
      ? "安装完成，无需变更。"
      : "安装结束，但没有可执行步骤。";
  }

  const completedSteps = result.steps.filter((step) => step.state === "completed").length;
  const failedSteps = result.steps.filter((step) => step.state === "failed").length;

  if (failedSteps > 0) {
    return `安装结束：成功 ${completedSteps} 项，失败 ${failedSteps} 项。${suffix}`;
  }

  return `安装完成：成功 ${completedSteps} 项。${suffix}`;
}

function formatInstallMessages(messages: string[]): string {
  const uniqueMessages = Array.from(new Set(messages));

  if (uniqueMessages.length === 0) {
    return "";
  }

  return ` ${uniqueMessages.map((message) => localizeMessage(message)).join(" ")}`;
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
  return localizeMessage(event.message.trim());
}

function formatInstallProgressStatus(entry: InstallProgressEvent): string {
  const message = formatInstallProgressMessage(entry);
  return message || "已收到安装进度更新。";
}

function buildNextSteps({
  connectivity,
  environment,
  installInProgress,
  installResult,
  status
}: {
  connectivity: ConnectivityResult | null;
  environment: DetectEnvironmentResult | null;
  installInProgress: boolean;
  installResult: InstallResult | null;
  status: string;
}): string[] {
  const steps = new Set<string>();
  const isReady = environment !== null && isEnvironmentReady(environment);
  const hasBlockingInstallResult = Boolean(installResult?.steps.some((step) => step.state === "failed"));
  const platform = environment?.platform;

  if (installInProgress) {
    steps.add("安装尚未结束，请保持窗口开启。");
  }

  if (!environment) {
    steps.add("请先重新执行环境检测。");
  } else if (!isReady) {
    steps.add("先处理缺失依赖，再重新执行安装。");
  } else {
    steps.add("环境已就绪，可以直接启动 Claude Code。");
  }

  if (platform === "darwin" && environment?.dependencies.some((dependency) => dependency.name === "git" && dependency.state !== "installed")) {
    steps.add("macOS 请安装 Xcode Command Line Tools 或 Homebrew Git，然后重新检测环境。");
  }

  if (hasBlockingInstallResult) {
    steps.add("重新执行“安装缺失依赖”以重试失败项目。");
  }

  if (connectivity && !connectivity.ok) {
    if (connectivity.reason === "missing_key") {
      steps.add("补充 Anthropic API Key 后重新保存配置。");
    } else if (connectivity.reason === "invalid_endpoint") {
      steps.add("请填写合法的 Base URL 后再保存配置。");
    } else if (connectivity.reason === "auth") {
      steps.add("请检查 API Key 后重新执行连通性校验。");
    } else {
      steps.add("请处理网络或超时问题，然后重新执行连通性校验。");
    }
  }

  if (/当前版本暂不支持启动|环境未就绪/u.test(status)) {
    steps.add("只有所有依赖都显示已安装后，启动按钮才会可用。");
  }

  if (environment?.dependencies.some((dependency) => dependency.name === "claude" && dependency.state !== "installed")) {
    steps.add("请先安装 Claude Code，再执行启动。");
  }

  return Array.from(steps).slice(0, 5);
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
  maxWidth: 1120,
  margin: "0 auto",
  padding: 16,
  display: "grid",
  gap: 12,
  background: "#1e1e1e",
  color: "#cccccc"
};

const heroStyle: CSSProperties = {
  display: "grid",
  gap: 4
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#8c8c8c",
  fontSize: 11,
  fontWeight: 600
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.2,
  color: "#ffffff",
  fontWeight: 600
};

const statusStyle: CSSProperties = {
  margin: 0,
  color: "#9d9d9d",
  fontSize: 12
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: 8
};

const sectionHeadingStyle: CSSProperties = {
  display: "grid",
  gap: 2
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "#ffffff",
  fontWeight: 600
};

const sectionCopyStyle: CSSProperties = {
  margin: 0,
  color: "#8c8c8c",
  fontSize: 12
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
};

const panelStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  maxWidth: 720,
  padding: 12,
  borderRadius: 8,
  background: "#252526",
  border: "1px solid #3c3c3c"
};

const reportStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 8,
  background: "#252526",
  border: "1px solid #3c3c3c"
};

const reportTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 600,
  color: "#ffffff"
};

const reportListStyle: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: 6
};

const reportItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 10,
  borderRadius: 8,
  background: "#1f1f1f",
  border: "1px solid #3c3c3c"
};

const reportHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8
};

const reportNameStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#ffffff"
};

function reportStateStyle(state: string): CSSProperties {
  return {
    borderRadius: 8,
    border: "1px solid #3c3c3c",
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    color: "#cccccc",
    background: "#1e1e1e"
  };
}

const reportMessageStyle: CSSProperties = {
  margin: 0,
  color: "#cccccc",
  lineHeight: 1.5,
  fontSize: 12
};

const progressPanelStyle: CSSProperties = {
  ...reportStyle
};

const progressStatusStyle: CSSProperties = {
  margin: 0,
  color: "#9d9d9d",
  fontSize: 12,
  lineHeight: 1.5
};
