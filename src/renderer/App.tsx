import { useEffect, useMemo, useState } from "react";
import claudeLogo from "../../AI/Claude.png";

import type {
  ActivityEntry,
  AnthropicAdminConfig,
  AnthropicUsageResult,
  AppSection,
  ConnectivityResult,
  DiscoveredMcpRecord,
  DiscoveredSkillRecord,
  DetectEnvironmentResult,
  InstallProgressEvent,
  InstallResult,
  McpRecord,
  McpRecordInput,
  SkillRecord,
  SkillRecordInput,
  TokenUsageRange
} from "../shared/contracts";
import type { ConfigInput, DependencyStatus } from "../shared/schemas";

import { ConfigForm } from "./components/ConfigForm";
import { ConnectivityBanner } from "./components/ConnectivityBanner";
import { DependencyCard } from "./components/DependencyCard";
import { InstallActions } from "./components/InstallActions";
import { LibraryEditor } from "./components/LibraryEditor";
import { TokenUsagePanel } from "./components/TokenUsagePanel";
import {
  localizeDependencyName,
  localizeInstallStage,
  localizeInstallState,
  localizeMessage
} from "./lib/ui-copy";

interface InstallProgressEntry extends InstallProgressEvent {
  id: string;
}

type RendererApi = Window["pclaude"];
const CLAUDE_LAUNCH_POLL_INTERVAL_MS = import.meta.env.MODE === "test" ? 20 : 2000;
const requiredEnvironmentDependencies = new Set<DependencyStatus["name"]>(["node", "npm", "git", "claude"]);

const sectionMeta: Record<
  AppSection,
  {
    title: string;
    subtitle: string;
  }
> = {
  config: { title: "配置", subtitle: "配置界面" },
  mcp: { title: "MCP", subtitle: "MCP 管理" },
  skill: { title: "Skill", subtitle: "Skill 管理" },
  token: { title: "Token", subtitle: "Token 用量" }
};

export function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("config");
  const [environment, setEnvironment] = useState<DetectEnvironmentResult | null>(null);
  const [savedConfig, setSavedConfig] = useState<ConfigInput | null>(null);
  const [configPlaceholders, setConfigPlaceholders] = useState<Partial<ConfigInput> | null>(null);
  const [connectivity, setConnectivity] = useState<ConnectivityResult | null>(null);
  const [environmentRefreshing, setEnvironmentRefreshing] = useState(false);
  const [installInProgress, setInstallInProgress] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgressEntry[]>([]);
  const [lastInstallResult, setLastInstallResult] = useState<InstallResult | null>(null);
  const [lastEnvironmentCheckAt, setLastEnvironmentCheckAt] = useState<number | null>(null);
  const [status, setStatus] = useState("正在检测本机环境…");
  const [mcpRecords, setMcpRecords] = useState<McpRecord[]>([]);
  const [skillRecords, setSkillRecords] = useState<SkillRecord[]>([]);
  const [discoveredMcpRecords, setDiscoveredMcpRecords] = useState<DiscoveredMcpRecord[]>([]);
  const [discoveredSkillRecords, setDiscoveredSkillRecords] = useState<DiscoveredSkillRecord[]>([]);
  const [mcpActivity, setMcpActivity] = useState<ActivityEntry[]>([]);
  const [skillActivity, setSkillActivity] = useState<ActivityEntry[]>([]);
  const [anthropicAdminConfig, setAnthropicAdminConfig] = useState<AnthropicAdminConfig>({ adminKey: "" });
  const [tokenRange, setTokenRange] = useState<TokenUsageRange>("30d");
  const [tokenUsage, setTokenUsage] = useState<AnthropicUsageResult | null>(null);

  const currentMeta = sectionMeta[activeSection];

  useEffect(() => {
    let cancelled = false;
    const api = window.pclaude as RendererApi | undefined;

    void refreshEnvironment(() => cancelled);
    void loadSavedConfig(api, cancelled, setSavedConfig);
    void loadConfigPlaceholders(api, cancelled, setConfigPlaceholders);
    void loadLibraryData(
      api,
      cancelled,
      setMcpRecords,
      setSkillRecords,
      setDiscoveredMcpRecords,
      setDiscoveredSkillRecords,
      setMcpActivity,
      setSkillActivity
    );
    void loadAnthropicConfig(api, cancelled, setAnthropicAdminConfig, setTokenUsage, tokenRange);

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

  useEffect(() => {
    const api = window.pclaude as RendererApi | undefined;

    if (!api?.getClaudeLaunchState || !/Claude Code 已在终端中启动/u.test(status)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void api.getClaudeLaunchState?.().then((isRunning) => {
        if (!isRunning) {
          setStatus("Claude Code 已停止。");
        }
      });
    }, CLAUDE_LAUNCH_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [status]);

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
      setLastEnvironmentCheckAt(Date.now());
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
      await api.launchClaudeCode();
      setStatus("Claude Code 已在终端中启动。");
    } catch (error) {
      const message =
        error instanceof Error && error.message ? localizeMessage(error.message) : "启动流程失败";

      setStatus(message);
    }
  }

  async function handleSaveConfig(input: ConfigInput) {
    const api = window.pclaude as RendererApi | undefined;

    try {
      if (!api) {
        throw new Error("Renderer API is unavailable.");
      }

      await api.saveConfig(input);
      setSavedConfig(input);

      const result = await api.testConnectivity(input);
      setConnectivity(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save configuration.";

      setConnectivity({
        ok: false,
        reason: "network",
        message: localizeMessage(message)
      });
    }
  }

  async function handleSaveMcp(input: McpRecordInput | SkillRecordInput) {
    const api = window.pclaude as RendererApi | undefined;
    if (!api?.saveMcpRecord) {
      return;
    }

    await api.saveMcpRecord(input as McpRecordInput);
    await refreshMcpData();
  }

  async function handleImportMcp(input: DiscoveredMcpRecord) {
    const api = window.pclaude as RendererApi | undefined;
    if (!api?.importMcpRecord) {
      return;
    }

    await api.importMcpRecord(input);
    await refreshMcpData();
  }

  async function handleDeleteMcp(id: string) {
    const api = window.pclaude as RendererApi | undefined;
    if (!api?.deleteMcpRecord) {
      return;
    }

    await api.deleteMcpRecord(id);
    await refreshMcpData();
  }

  async function handleSaveSkill(input: McpRecordInput | SkillRecordInput) {
    const api = window.pclaude as RendererApi | undefined;
    if (!api?.saveSkillRecord) {
      return;
    }

    await api.saveSkillRecord(input as SkillRecordInput);
    await refreshSkillData();
  }

  async function handleImportSkill(input: DiscoveredSkillRecord) {
    const api = window.pclaude as RendererApi | undefined;
    if (!api?.importSkillRecord) {
      return;
    }

    await api.importSkillRecord(input);
    await refreshSkillData();
  }

  async function handleDeleteSkill(id: string) {
    const api = window.pclaude as RendererApi | undefined;
    if (!api?.deleteSkillRecord) {
      return;
    }

    await api.deleteSkillRecord(id);
    await refreshSkillData();
  }

  async function refreshMcpData() {
    const api = window.pclaude as RendererApi | undefined;

    if (!api) {
      return;
    }

    const [nextMcpRecords, nextDiscoveredMcpRecords, nextMcpActivity] = await Promise.all([
      api.listMcpRecords?.() ?? Promise.resolve([]),
      api.scanMcpRecords?.() ?? Promise.resolve([]),
      api.listActivityEntries?.("mcp") ?? Promise.resolve([])
    ]);

    setMcpRecords(nextMcpRecords);
    setDiscoveredMcpRecords(nextDiscoveredMcpRecords);
    setMcpActivity(nextMcpActivity);
  }

  async function refreshSkillData() {
    const api = window.pclaude as RendererApi | undefined;

    if (!api) {
      return;
    }

    const [nextSkillRecords, nextDiscoveredSkillRecords, nextSkillActivity] = await Promise.all([
      api.listSkillRecords?.() ?? Promise.resolve([]),
      api.scanSkillRecords?.() ?? Promise.resolve([]),
      api.listActivityEntries?.("skill") ?? Promise.resolve([])
    ]);

    setSkillRecords(nextSkillRecords);
    setDiscoveredSkillRecords(nextDiscoveredSkillRecords);
    setSkillActivity(nextSkillActivity);
  }

  async function refreshLibraryData() {
    await Promise.all([refreshMcpData(), refreshSkillData()]);
  }

  async function handleSaveAnthropicAdminConfig(input: AnthropicAdminConfig) {
    const api = window.pclaude as RendererApi | undefined;

    if (!api?.saveAnthropicAdminConfig) {
      return;
    }

    const nextConfig = await api.saveAnthropicAdminConfig(input);
    setAnthropicAdminConfig(nextConfig);
    await refreshAnthropicUsage(tokenRange);
  }

  async function refreshAnthropicUsage(range = tokenRange) {
    const api = window.pclaude as RendererApi | undefined;

    if (!api?.getAnthropicUsage) {
      return;
    }

    const result = await api.getAnthropicUsage({ range });
    setTokenUsage(result);
  }

  const configSummary = useMemo(() => {
    const requiredDependencies =
      environment?.dependencies.filter((dependency) => requiredEnvironmentDependencies.has(dependency.name)) ?? [];
    const total = requiredDependencies.length;
    const ready = requiredDependencies.filter((dependency) => dependency.state === "installed").length;
    return { total, ready };
  }, [environment]);
  const currentStatusTone = resolveStatusTone(status);
  const launchAvailable = Boolean((window.pclaude as RendererApi | undefined)?.launchClaudeCode);
  const launchEnabled = environment !== null && isEnvironmentReady(environment) && !installInProgress;

  return (
    <main className="claudehub-shell">
      <aside className="claudehub-rail">
        <div className="claudehub-rail__top">
          <RailButton icon="config" label="Config" selected={activeSection === "config"} onClick={() => setActiveSection("config")} />
          <RailButton icon="mcp" label="MCP" selected={activeSection === "mcp"} onClick={() => setActiveSection("mcp")} />
          <RailButton icon="skill" label="Skill" selected={activeSection === "skill"} onClick={() => setActiveSection("skill")} />
        </div>

        <button
          aria-label="Token 用量"
          className={`token-rail ${activeSection === "token" ? "is-active" : ""}`}
          type="button"
          onClick={() => setActiveSection("token")}
        >
          <span className="token-rail__icon" data-testid="rail-icon-token" aria-hidden="true">
            <RailIcon kind="token" />
          </span>
          <span className="token-rail__ring">
            <span className="token-rail__value">
              {tokenUsage?.ok ? `${Math.min(99, Math.round(tokenUsage.totals.totalCostUsd * 10))}%` : "--"}
            </span>
          </span>
          <span className="token-rail__label">Token 用量</span>
        </button>
      </aside>

      <section className="claudehub-main">
        <header className="section-header">
          <div className="section-header__title-row">
            <h1>{currentMeta.title}</h1>
            <span className="section-header__brand">✳ ClaudeCode</span>
          </div>
          <p>{currentMeta.subtitle}</p>
        </header>

        <div className="section-body">
          {activeSection === "config" ? (
            <>
              <div className="metric-grid metric-grid--config">
                <MetricCard label="环境状态" value={environment ? `${configSummary.ready}/${configSummary.total}` : "--"} />
                <MetricCard
                  label="配置状态"
                  value={savedConfig?.apiKey || configPlaceholders?.apiKey ? "已配置" : "待配置"}
                />
                <MetricCard
                  label="最近安装"
                  value={lastInstallResult ? (lastInstallResult.ok ? "成功" : "需重试") : "未安装"}
                />
                <StatusMetricCard
                  label="当前状态"
                  value={status}
                  tone={currentStatusTone}
                  lastCheckedAt={lastEnvironmentCheckAt}
                  launchAvailable={launchAvailable}
                  launchEnabled={launchEnabled}
                  launchLabel={resolveLaunchSummary(status, environment, installInProgress, launchAvailable)}
                  onLaunch={handleLaunch}
                />
              </div>
              <div className="dependency-grid">
                {environment?.dependencies.map((dependency) => (
                  <DependencyCard key={dependency.name} dependency={dependency} />
                ))}
              </div>
              <InstallActions
                launchAvailable={launchAvailable}
                launchEnabled={launchEnabled}
                installInProgress={installInProgress}
                refreshInProgress={environmentRefreshing}
                onRefresh={handleRefresh}
                onInstall={handleInstall}
                onLaunch={handleLaunch}
              />
              <div className="panel-card panel-card--config">
                <ConfigForm
                  initialValue={savedConfig}
                  placeholderValue={mergeConfigPlaceholders(configPlaceholders, savedConfig)}
                  onSubmit={handleSaveConfig}
                />
                <ConnectivityBanner result={connectivity} />
              </div>
              {installInProgress || installProgress.length > 0 ? (
                <InstallProgressPanel entries={installProgress} running={installInProgress} />
              ) : null}
              {lastInstallResult ? <InstallReport result={lastInstallResult} /> : null}
            </>
          ) : null}

          {activeSection === "mcp" ? (
            <>
              <OverviewBlock
                countLabel={`已配置 ${mcpRecords.length} 项`}
                enabledLabel={`本地发现 ${discoveredMcpRecords.length} 项`}
                statusLabel={mcpRecords[0]?.name ?? "暂无最近项"}
              />
              <LibraryEditor
                discoveries={discoveredMcpRecords}
                kind="mcp"
                onDelete={handleDeleteMcp}
                onImport={async (input) => {
                  if (!isDiscoveredMcpRecord(input)) {
                    return;
                  }

                  await handleImportMcp(input);
                }}
                onRefreshDiscoveries={refreshMcpData}
                onSave={handleSaveMcp}
                records={mcpRecords}
              />
              <ActivityList entries={mcpActivity} emptyLabel="还没有 MCP 活动记录。" />
            </>
          ) : null}

          {activeSection === "skill" ? (
            <>
              <OverviewBlock
                countLabel={`已配置 ${skillRecords.length} 项`}
                enabledLabel={`本地发现 ${discoveredSkillRecords.length} 项`}
                statusLabel={skillRecords[0]?.name ?? "暂无最近项"}
              />
              <LibraryEditor
                discoveries={discoveredSkillRecords}
                kind="skill"
                onDelete={handleDeleteSkill}
                onImport={async (input) => {
                  if (!isDiscoveredSkillRecord(input)) {
                    return;
                  }

                  await handleImportSkill(input);
                }}
                onRefreshDiscoveries={refreshSkillData}
                onSave={handleSaveSkill}
                records={skillRecords}
              />
              <ActivityList entries={skillActivity} emptyLabel="还没有 Skill 活动记录。" />
            </>
          ) : null}

          {activeSection === "token" ? (
            <TokenUsagePanel
              adminConfig={anthropicAdminConfig}
              range={tokenRange}
              result={tokenUsage}
              onRangeChange={setTokenRange}
              onRefresh={refreshAnthropicUsage}
              onSaveConfig={handleSaveAnthropicAdminConfig}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function RailButton({
  icon,
  label,
  onClick,
  selected
}: {
  icon: "config" | "mcp" | "skill";
  label: string;
  onClick: () => void;
  selected: boolean;
}) {
  const isLocalizedLabel = /[\u3400-\u9fff]/u.test(label);

  return (
    <button className={`rail-button ${selected ? "is-active" : ""}`} type="button" onClick={onClick}>
      <span className="rail-button__icon" data-testid={`rail-icon-${icon}`} aria-hidden="true">
        <RailIcon kind={icon} />
      </span>
      <span className={isLocalizedLabel ? "rail-button__label rail-button__label--localized" : "rail-button__label"}>
        {label}
      </span>
    </button>
  );
}

function RailIcon({ kind }: { kind: "config" | "mcp" | "skill" | "token" }) {
  switch (kind) {
    case "config":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3.5 4.5 7.5v9L12 20.5l7.5-4v-9L12 3.5Z" />
          <path d="M12 8.5v7" />
          <path d="M8.5 12h7" />
        </svg>
      );
    case "mcp":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5" width="6" height="6" rx="1.5" />
          <rect x="14" y="5" width="6" height="6" rx="1.5" />
          <rect x="9" y="13" width="6" height="6" rx="1.5" />
          <path d="M10 8h4" />
          <path d="M12 11v2" />
        </svg>
      );
    case "skill":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 5.5h7l3 3V18.5H7z" />
          <path d="M14 5.5v3h3" />
          <path d="M9.5 12h5" />
          <path d="M9.5 15h5" />
        </svg>
      );
    case "token":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 17 10 12l3 3 6-7" />
          <path d="M5 7v10" />
          <path d="M5 17h14" />
        </svg>
      );
  }
}

function OverviewBlock({
  countLabel,
  enabledLabel,
  statusLabel
}: {
  countLabel: string;
  enabledLabel: string;
  statusLabel: string;
}) {
  return (
    <div className="metric-grid">
      <MetricCard label="总量" value={countLabel} />
      <MetricCard label="启用" value={enabledLabel} />
      <MetricCard label="最近更新" value={statusLabel} long />
    </div>
  );
}

function MetricCard({
  label,
  value,
  long = false,
  tone = "default",
  className = ""
}: {
  label: string;
  value: string;
  long?: boolean;
  tone?: "default" | "running";
  className?: string;
}) {
  return (
    <article
      className={`metric-card ${long ? "is-wide" : ""} ${tone === "running" ? "metric-card--running" : ""} ${className}`.trim()}
    >
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
    </article>
  );
}

function StatusMetricCard({
  label,
  value,
  tone,
  lastCheckedAt,
  launchAvailable,
  launchEnabled,
  launchLabel,
  onLaunch
}: {
  label: string;
  value: string;
  tone: "default" | "running";
  lastCheckedAt: number | null;
  launchAvailable: boolean;
  launchEnabled: boolean;
  launchLabel: string;
  onLaunch: () => void;
}) {
  return (
    <article className={`metric-card metric-card--full-row ${tone === "running" ? "metric-card--running" : ""}`.trim()}>
      <div className="metric-card__split">
        <div className="metric-card__primary">
          <span className="metric-card__label">{label}</span>
          <strong className="metric-card__value">{value}</strong>
        </div>
        <div className="metric-card__aside">
          <div className="metric-card__meta">
            <span className="metric-card__meta-label">最近检测</span>
            <strong className="metric-card__meta-value">{formatLastCheckedLabel(lastCheckedAt)}</strong>
          </div>
          <div className="metric-card__meta">
            <span className="metric-card__meta-label">Claude 状态</span>
            <strong className="metric-card__meta-value metric-card__meta-value--with-logo">
              <img alt="Claude logo" className="metric-card__meta-logo" src={claudeLogo} />
              <span>{launchLabel}</span>
            </strong>
          </div>
          {launchAvailable ? (
            <button className="ghost-button metric-card__action" type="button" disabled={!launchEnabled} onClick={onLaunch}>
              立即启动
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function resolveStatusTone(status: string): "default" | "running" {
  return /Claude Code 已在终端中启动/u.test(status) ? "running" : "default";
}

function resolveLaunchSummary(
  status: string,
  environment: DetectEnvironmentResult | null,
  installInProgress: boolean,
  launchAvailable: boolean
): string {
  if (!launchAvailable) {
    return "不可用";
  }

  if (/Claude Code 已在终端中启动/u.test(status)) {
    return "运行中";
  }

  if (/正在启动 Claude Code/u.test(status)) {
    return "启动中";
  }

  if (/Claude Code 已停止/u.test(status)) {
    return "已停止";
  }

  if (installInProgress) {
    return "安装中";
  }

  if (!environment || !isEnvironmentReady(environment)) {
    return "等待环境";
  }

  return "未启动";
}

function formatLastCheckedLabel(lastCheckedAt: number | null): string {
  if (lastCheckedAt === null) {
    return "未检测";
  }

  if (Date.now() - lastCheckedAt < 60_000) {
    return "刚刚";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(lastCheckedAt);
}

function ActivityList({ entries, emptyLabel }: { entries: ActivityEntry[]; emptyLabel: string }) {
  if (entries.length === 0) {
    return <p className="empty-copy">{emptyLabel}</p>;
  }

  return (
    <section className="panel-card">
      <ul className="activity-list">
        {entries.map((entry) => (
          <li key={entry.id} className="activity-list__item">
            <div>
              <strong>{entry.label}</strong>
              <p>{entry.detail ?? "已更新记录。"}</p>
            </div>
            <span>{entry.action}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InstallReport({ result }: { result: InstallResult }) {
  return (
    <section className="panel-card">
      <div className="panel-card__heading">
        <h3>安装报告</h3>
        <p>最近一次安装结果。</p>
      </div>
      <ul className="activity-list">
        {result.steps.map((step) => (
          <li key={`${step.name}-${step.state}-${step.message ?? "none"}`} className="activity-list__item">
            <div>
              <strong>{localizeDependencyName(step.name)}</strong>
              {step.message ? <p>{localizeMessage(step.message)}</p> : null}
            </div>
            <span>{localizeInstallState(step.state)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InstallProgressPanel({ entries, running }: { entries: InstallProgressEntry[]; running: boolean }) {
  const latestEntry = entries.at(-1);

  return (
    <section className="panel-card" aria-live="polite">
      <div className="panel-card__heading">
        <h3>安装进度</h3>
        <p>{running ? "正在执行安装任务。" : "展示最近一次安装的进度记录。"}</p>
      </div>
      <p className="panel-card__status">
        {latestEntry ? formatInstallProgressStatus(latestEntry) : "等待安装事件…"}
      </p>
      <ul className="activity-list">
        {entries.map((entry) => (
          <li key={entry.id} className="activity-list__item">
            <div>
              <strong>{localizeDependencyName(entry.dependency)}</strong>
              <p>{formatInstallProgressMessage(entry)}</p>
            </div>
            <span>{localizeInstallStage(entry.stage)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function loadSavedConfig(
  api: RendererApi | undefined,
  cancelled: boolean,
  setSavedConfig: (value: ConfigInput | null) => void
) {
  if (cancelled || !api?.readConfig) {
    return;
  }

  const config = await api.readConfig();
  setSavedConfig(config);
}

async function loadConfigPlaceholders(
  api: RendererApi | undefined,
  cancelled: boolean,
  setConfigPlaceholders: (value: Partial<ConfigInput> | null) => void
) {
  if (cancelled || !api?.readConfigPlaceholders) {
    return;
  }

  const placeholders = await api.readConfigPlaceholders();
  setConfigPlaceholders(placeholders);
}

function mergeConfigPlaceholders(
  placeholderConfig: Partial<ConfigInput> | null,
  savedConfig: ConfigInput | null
): Partial<ConfigInput> | null {
  if (!placeholderConfig && !savedConfig) {
    return null;
  }

  return {
    apiKey: placeholderConfig?.apiKey ?? savedConfig?.apiKey ?? "",
    baseUrl: placeholderConfig?.baseUrl ?? savedConfig?.baseUrl ?? "",
    model: placeholderConfig?.model ?? savedConfig?.model ?? ""
  };
}

function isDiscoveredMcpRecord(
  input: DiscoveredMcpRecord | DiscoveredSkillRecord
): input is DiscoveredMcpRecord {
  return "command" in input && Array.isArray(input.args);
}

function isDiscoveredSkillRecord(
  input: DiscoveredMcpRecord | DiscoveredSkillRecord
): input is DiscoveredSkillRecord {
  return "content" in input && Array.isArray(input.tags);
}

async function loadLibraryData(
  api: RendererApi | undefined,
  cancelled: boolean,
  setMcpRecords: (value: McpRecord[]) => void,
  setSkillRecords: (value: SkillRecord[]) => void,
  setDiscoveredMcpRecords: (value: DiscoveredMcpRecord[]) => void,
  setDiscoveredSkillRecords: (value: DiscoveredSkillRecord[]) => void,
  setMcpActivity: (value: ActivityEntry[]) => void,
  setSkillActivity: (value: ActivityEntry[]) => void
) {
  if (cancelled || !api) {
    return;
  }

  const [mcp, skill, discoveredMcp, discoveredSkill, mcpActivity, skillActivity] = await Promise.all([
    api.listMcpRecords?.() ?? Promise.resolve([]),
    api.listSkillRecords?.() ?? Promise.resolve([]),
    api.scanMcpRecords?.() ?? Promise.resolve([]),
    api.scanSkillRecords?.() ?? Promise.resolve([]),
    api.listActivityEntries?.("mcp") ?? Promise.resolve([]),
    api.listActivityEntries?.("skill") ?? Promise.resolve([])
  ]);

  setMcpRecords(mcp);
  setSkillRecords(skill);
  setDiscoveredMcpRecords(discoveredMcp);
  setDiscoveredSkillRecords(discoveredSkill);
  setMcpActivity(mcpActivity);
  setSkillActivity(skillActivity);
}

async function loadAnthropicConfig(
  api: RendererApi | undefined,
  cancelled: boolean,
  setAnthropicAdminConfig: (value: AnthropicAdminConfig) => void,
  setTokenUsage: (value: AnthropicUsageResult | null) => void,
  range: TokenUsageRange
) {
  if (cancelled || !api?.getAnthropicAdminConfig) {
    return;
  }

  const config = await api.getAnthropicAdminConfig();
  setAnthropicAdminConfig(config);

  if (!api.getAnthropicUsage) {
    setTokenUsage({
      ok: false,
      reason: "missing_key",
      message: "当前版本暂不支持读取 Token 用量。"
    });
    return;
  }

  const usage = await api.getAnthropicUsage({ range });
  setTokenUsage(usage);
}

function isEnvironmentReady(result: DetectEnvironmentResult): boolean {
  return result.dependencies
    .filter((dependency) => requiredEnvironmentDependencies.has(dependency.name))
    .every((dependency) => dependency.state === "installed");
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
