import type { CSSProperties } from "react";

import claudeLogo from "../../../AI/Claude.png";
import gitLogo from "../../../AI/git.png";
import nodeLogo from "../../../AI/node.png";
import npmLogo from "../../../AI/npm.png";

import type { DependencyStatus } from "../../shared/schemas";
import { localizeDependencyName, localizeDependencyState, localizeMessage } from "../lib/ui-copy";

interface DependencyCardProps {
  dependency: DependencyStatus;
}

export function DependencyCard({ dependency }: DependencyCardProps) {
  const icon = dependencyIcons[dependency.name];
  const badgeStyle = dependency.state === "installed" ? installedStateStyle : stateStyle;

  return (
    <article style={cardStyle}>
      <div style={headerStyle}>
        <div style={titleWrapStyle}>
          <img alt={`${localizeDependencyName(dependency.name)} logo`} src={icon} style={logoStyle} />
          <h3 style={titleStyle}>{localizeDependencyName(dependency.name)}</h3>
        </div>
        <span style={badgeStyle}>{localizeDependencyState(dependency.state)}</span>
      </div>

      <dl data-testid="dependency-details" style={detailsStyle}>
        <div>
          <dt style={termStyle}>版本</dt>
          <dd style={definitionStyle}>{dependency.version ?? "未检测到"}</dd>
        </div>
        <div>
          <dt style={termStyle}>路径</dt>
          <dd style={definitionStyle}>{dependency.path ?? "未检测到"}</dd>
        </div>
        {dependency.message ? (
          <div>
            <dt style={termStyle}>说明</dt>
            <dd style={definitionStyle}>{localizeMessage(dependency.message)}</dd>
          </div>
        ) : null}
      </dl>
    </article>
  );
}

const dependencyIcons: Record<DependencyStatus["name"], string> = {
  node: nodeLogo,
  npm: npmLogo,
  git: gitLogo,
  claude: claudeLogo
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(206, 155, 122, 0.1)",
  borderRadius: 14,
  background: "#252526",
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  height: 136,
  minHeight: 136
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8
};

const titleWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0
};

const logoStyle: CSSProperties = {
  width: 18,
  height: 18,
  objectFit: "contain",
  flexShrink: 0
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.2,
  color: "#ffffff"
};

const stateStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid #3c3c3c",
  padding: "3px 8px",
  fontSize: 10,
  fontWeight: 600,
  color: "#cccccc",
  background: "#1e1e1e",
  flexShrink: 0
};

const installedStateStyle: CSSProperties = {
  ...stateStyle,
  color: "#7fdc9a",
  borderColor: "#2f8f59",
  background: "rgba(25, 60, 37, 0.7)"
};

const detailsStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  margin: 0,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  paddingRight: 4
};

const termStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#8c8c8c",
  marginBottom: 2
};

const definitionStyle: CSSProperties = {
  margin: 0,
  wordBreak: "break-word",
  color: "#cccccc",
  lineHeight: 1.3,
  fontSize: 11
};
