import type { CSSProperties } from "react";

import type { DependencyStatus } from "../../shared/schemas";
import { localizeDependencyName, localizeDependencyState, localizeMessage } from "../lib/ui-copy";

interface DependencyCardProps {
  dependency: DependencyStatus;
}

export function DependencyCard({ dependency }: DependencyCardProps) {
  return (
    <article style={cardStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>{localizeDependencyName(dependency.name)}</h3>
        <span style={stateStyle}>{localizeDependencyState(dependency.state)}</span>
      </div>

      <dl style={detailsStyle}>
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

const cardStyle: CSSProperties = {
  border: "1px solid #3c3c3c",
  borderRadius: 8,
  background: "#252526",
  padding: 12
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 10
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.2,
  color: "#ffffff"
};

const stateStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid #3c3c3c",
  padding: "2px 8px",
  fontSize: 11,
  fontWeight: 600,
  color: "#cccccc",
  background: "#1e1e1e"
};

const detailsStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  margin: 0
};

const termStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#8c8c8c",
  marginBottom: 2
};

const definitionStyle: CSSProperties = {
  margin: 0,
  wordBreak: "break-word",
  color: "#cccccc",
  lineHeight: 1.4,
  fontSize: 12
};
