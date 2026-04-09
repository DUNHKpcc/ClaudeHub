import type { CSSProperties } from "react";

interface InstallActionsProps {
  onInstall: () => void | Promise<void>;
}

export function InstallActions({ onInstall }: InstallActionsProps) {
  return (
    <div style={actionsStyle}>
      <button style={buttonStyle} type="button" onClick={() => void onInstall()}>
        Install Missing Dependencies
      </button>
    </div>
  );
}

const actionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-start"
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
