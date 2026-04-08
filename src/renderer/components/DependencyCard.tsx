import type { CSSProperties } from "react";

import type { DependencyStatus } from "../../shared/schemas";

interface DependencyCardProps {
  dependency: DependencyStatus;
}

export function DependencyCard({ dependency }: DependencyCardProps) {
  return (
    <article style={cardStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>{dependency.name}</h3>
        <span style={stateStyle}>{dependency.state}</span>
      </div>

      <dl style={detailsStyle}>
        <div>
          <dt style={termStyle}>Version</dt>
          <dd style={definitionStyle}>{dependency.version ?? "Not detected"}</dd>
        </div>
        <div>
          <dt style={termStyle}>Path</dt>
          <dd style={definitionStyle}>{dependency.path ?? "Not detected"}</dd>
        </div>
      </dl>
    </article>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 18,
  background: "rgba(15, 23, 42, 0.72)",
  padding: 18
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 16
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  textTransform: "capitalize"
};

const stateStyle: CSSProperties = {
  borderRadius: 999,
  background: "rgba(59, 130, 246, 0.18)",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};

const detailsStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  margin: 0
};

const termStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 4
};

const definitionStyle: CSSProperties = {
  margin: 0,
  wordBreak: "break-word"
};
