import type { CSSProperties } from "react";

interface InstallActionsProps {
  onRefresh: () => void | Promise<void>;
  onInstall: () => void | Promise<void>;
  onLaunch: () => void | Promise<void>;
  installInProgress?: boolean;
  refreshInProgress?: boolean;
  launchAvailable?: boolean;
  launchEnabled?: boolean;
}

export function InstallActions({
  refreshInProgress = false,
  installInProgress = false,
  launchAvailable = false,
  launchEnabled = false,
  onRefresh,
  onInstall,
  onLaunch
}: InstallActionsProps) {
  return (
    <div style={actionsStyle}>
      <section style={createActionCardStyle(actionThemes.refresh)}>
        <div style={copyStackStyle}>
          <h3 style={createTitleStyle(actionThemes.refresh)}>检测</h3>
          <p style={createCopyStyle(actionThemes.refresh)}>
            重新执行本机环境检测，刷新 Node、Git、Claude Code 的状态。
          </p>
        </div>
        <button
          disabled={refreshInProgress || installInProgress}
          style={createButtonStyle(actionThemes.refresh)}
          type="button"
          onClick={() => void onRefresh()}
        >
          {refreshInProgress ? "检测中…" : "重新检测环境"}
        </button>
      </section>

      <section style={createActionCardStyle(actionThemes.install)}>
        <div style={copyStackStyle}>
          <h3 style={createTitleStyle(actionThemes.install)}>安装</h3>
          <p style={createCopyStyle(actionThemes.install)}>
            {installInProgress
              ? "安装进行中，请保持窗口开启。"
              : "根据当前检测结果安装 Claude Code 与缺失依赖。"}
          </p>
        </div>
        <button
          aria-busy={installInProgress}
          disabled={installInProgress}
          style={createButtonStyle(actionThemes.install)}
          type="button"
          onClick={() => void onInstall()}
        >
          {installInProgress ? "安装中…" : "安装 Claude Code 与缺失依赖"}
        </button>
      </section>

      <section style={createActionCardStyle(actionThemes.launch)}>
        <div style={copyStackStyle}>
          <h3 style={createTitleStyle(actionThemes.launch)}>启动</h3>
          <p id="launch-availability" style={createCopyStyle(actionThemes.launch)}>
            {launchAvailable
              ? launchEnabled
                ? "环境就绪后可直接启动 Claude Code。"
                : "环境未就绪时也可点击，界面会提示下一步。"
              : "当前版本尚未暴露启动能力。"}
          </p>
        </div>
        <button
          disabled={installInProgress}
          style={createButtonStyle(actionThemes.launch)}
          type="button"
          onClick={() => void onLaunch()}
        >
          启动 Claude Code
        </button>
      </section>
    </div>
  );
}

const actionsStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
};

const baseActionCardStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 10,
  borderRadius: 8,
  alignContent: "start"
};

const copyStackStyle: CSSProperties = {
  display: "grid",
  gap: 3,
  minHeight: 56
};

const baseTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.2
};

const baseCopyStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  lineHeight: 1.4
};

const baseButtonStyle: CSSProperties = {
  appearance: "none",
  borderRadius: 8,
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  padding: "0 12px",
  width: "100%",
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center"
};

const actionThemes = {
  refresh: {
    cardBackground: "#1f2d39",
    cardBorder: "#35556d",
    titleColor: "#d9efff",
    copyColor: "#a5c2d9",
    buttonBackground: "#213544",
    buttonBorder: "#4d7594"
  },
  install: {
    cardBackground: "#2d231d",
    cardBorder: "#6e4b34",
    titleColor: "#ffe4d1",
    copyColor: "#d4b29a",
    buttonBackground: "#4a3223",
    buttonBorder: "#9a6a4d"
  },
  launch: {
    cardBackground: "#1d2b23",
    cardBorder: "#406a52",
    titleColor: "#ddf7e6",
    copyColor: "#a9d3b8",
    buttonBackground: "#20382a",
    buttonBorder: "#4f8e69"
  }
} as const;

function createActionCardStyle(theme: (typeof actionThemes)[keyof typeof actionThemes]): CSSProperties {
  return {
    ...baseActionCardStyle,
    background: theme.cardBackground,
    border: `1px solid ${theme.cardBorder}`
  };
}

function createTitleStyle(theme: (typeof actionThemes)[keyof typeof actionThemes]): CSSProperties {
  return {
    ...baseTitleStyle,
    color: theme.titleColor
  };
}

function createCopyStyle(theme: (typeof actionThemes)[keyof typeof actionThemes]): CSSProperties {
  return {
    ...baseCopyStyle,
    color: theme.copyColor
  };
}

function createButtonStyle(theme: (typeof actionThemes)[keyof typeof actionThemes]): CSSProperties {
  return {
    ...baseButtonStyle,
    background: theme.buttonBackground,
    border: `1px solid ${theme.buttonBorder}`
  };
}
