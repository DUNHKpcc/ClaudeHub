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
      <section style={actionCardStyle}>
        <div style={copyStackStyle}>
          <h3 style={titleStyle}>检测</h3>
          <p style={copyStyle}>
            重新执行本机环境检测，刷新 Node、Git、Claude Code 的状态。
          </p>
        </div>
        <button
          disabled={refreshInProgress || installInProgress}
          style={secondaryButtonStyle}
          type="button"
          onClick={() => void onRefresh()}
        >
          {refreshInProgress ? "检测中…" : "重新检测环境"}
        </button>
      </section>

      <section style={actionCardStyle}>
        <div style={copyStackStyle}>
          <h3 style={titleStyle}>安装</h3>
          <p style={copyStyle}>
            {installInProgress
              ? "安装进行中，请保持窗口开启。"
              : "根据当前检测结果安装 Claude Code 与缺失依赖。"}
          </p>
        </div>
        <button
          aria-busy={installInProgress}
          disabled={installInProgress}
          style={buttonStyle}
          type="button"
          onClick={() => void onInstall()}
        >
          {installInProgress ? "安装中…" : "安装 Claude Code 与缺失依赖"}
        </button>
      </section>

      <section style={actionCardStyle}>
        <div style={copyStackStyle}>
          <h3 style={titleStyle}>启动</h3>
          <p id="launch-availability" style={copyStyle}>
            {launchAvailable
              ? launchEnabled
                ? "环境就绪后可直接启动 Claude Code。"
                : "环境未就绪时也可点击，界面会提示下一步。"
              : "当前版本尚未暴露启动能力。"}
          </p>
        </div>
        <button
          disabled={installInProgress}
          style={secondaryButtonStyle}
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
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const actionCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 12,
  borderRadius: 8,
  background: "#252526",
  border: "1px solid #3c3c3c"
};

const copyStackStyle: CSSProperties = {
  display: "grid",
  gap: 4
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.2,
  color: "#ffffff"
};

const copyStyle: CSSProperties = {
  margin: 0,
  color: "#9d9d9d",
  fontSize: 12,
  lineHeight: 1.5
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid #3c3c3c",
  borderRadius: 8,
  background: "#2d2d30",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px"
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "#252526"
};
