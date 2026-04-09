import type { CSSProperties } from "react";

interface InstallActionsProps {
  onInstall: () => void | Promise<void>;
  onLaunch?: () => void | Promise<void>;
  installInProgress?: boolean;
  launchAvailable?: boolean;
  launchEnabled?: boolean;
}

export function InstallActions({
  installInProgress = false,
  launchAvailable = false,
  launchEnabled = false,
  onInstall,
  onLaunch
}: InstallActionsProps) {
  return (
    <div style={actionsStyle}>
      <section style={actionCardStyle}>
        <div style={copyStackStyle}>
          <h3 style={titleStyle}>Install Missing Dependencies</h3>
          <p style={copyStyle}>
            {installInProgress
              ? "Installer is running. Keep this window open while dependencies are being fetched and verified."
              : "Run the detected install flow against the local toolchain."}
          </p>
        </div>
        <button
          aria-busy={installInProgress}
          disabled={installInProgress}
          style={buttonStyle}
          type="button"
          onClick={() => void onInstall()}
        >
          {installInProgress ? "Installing Dependencies..." : "Install Missing Dependencies"}
        </button>
      </section>

      <section style={actionCardStyle}>
        <div style={copyStackStyle}>
          <h3 style={titleStyle}>Launch Claude Code</h3>
          <p id="launch-availability" style={copyStyle}>
            {launchAvailable
              ? launchEnabled
                ? "Start Claude Code after a successful install."
                : "Finish dependency checks before launching Claude Code."
              : "Launch will become available once the preload API exposes a launcher."}
          </p>
        </div>
        <button
          disabled={!launchAvailable || !launchEnabled || !onLaunch}
          style={secondaryButtonStyle}
          type="button"
          onClick={() => void onLaunch?.()}
        >
          Launch Claude Code
        </button>
      </section>
    </div>
  );
}

const actionsStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))"
};

const actionCardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 20,
  borderRadius: 20,
  background: "rgba(15, 23, 42, 0.58)",
  border: "1px solid rgba(148, 163, 184, 0.18)"
};

const copyStackStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.2
};

const copyStyle: CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(96, 165, 250, 0.45)",
  borderRadius: 999,
  background: "linear-gradient(135deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.9))",
  color: "#eff6ff",
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 700,
  padding: "12px 18px"
};

const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  background: "rgba(30, 41, 59, 0.8)"
};
