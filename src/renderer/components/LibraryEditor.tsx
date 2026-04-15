import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import type {
  DiscoveredMcpRecord,
  DiscoveredSkillRecord,
  McpRecord,
  McpRecordInput,
  SkillRecord,
  SkillRecordInput
} from "../../shared/contracts";

interface LibraryEditorProps {
  kind: "mcp" | "skill";
  records: McpRecord[] | SkillRecord[];
  discoveries: DiscoveredMcpRecord[] | DiscoveredSkillRecord[];
  onSave: (input: McpRecordInput | SkillRecordInput) => Promise<void>;
  onImport: (input: DiscoveredMcpRecord | DiscoveredSkillRecord) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRefreshDiscoveries: () => Promise<void>;
}

const emptyMcpForm = {
  id: "",
  name: "",
  command: "",
  argsText: "",
  description: "",
  enabled: true
};

const emptySkillForm = {
  id: "",
  name: "",
  description: "",
  tagsText: "",
  content: "",
  enabled: true
};

export function LibraryEditor({
  kind,
  records,
  discoveries,
  onSave,
  onImport,
  onDelete,
  onRefreshDiscoveries
}: LibraryEditorProps) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [validationMessage, setValidationMessage] = useState("");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshingDiscoveries, setRefreshingDiscoveries] = useState(false);
  const [mcpForm, setMcpForm] = useState(emptyMcpForm);
  const [skillForm, setSkillForm] = useState(emptySkillForm);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId),
    [records, selectedId]
  );

  useEffect(() => {
    if (kind === "mcp") {
      const record = selectedRecord as McpRecord | undefined;
      if (!record) {
        setMcpForm(emptyMcpForm);
        return;
      }

      setMcpForm({
        id: record.id,
        name: record.name,
        command: record.command,
        argsText: record.args.join(" "),
        description: record.description,
        enabled: record.enabled
      });
      return;
    }

    const record = selectedRecord as SkillRecord | undefined;
    if (!record) {
      setSkillForm(emptySkillForm);
      return;
    }

    setSkillForm({
      id: record.id,
      name: record.name,
      description: record.description,
      tagsText: record.tags.join(", "),
      content: record.content,
      enabled: record.enabled
    });
  }, [kind, selectedRecord]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationMessage("");

    if (kind === "mcp") {
      if (!mcpForm.name.trim() || !mcpForm.command.trim()) {
        setValidationMessage("请填写名称和命令。");
        return;
      }

      await onSave({
        id: mcpForm.id || undefined,
        name: mcpForm.name.trim(),
        command: mcpForm.command.trim(),
        args: mcpForm.argsText
          .split(/\s+/u)
          .map((item) => item.trim())
          .filter(Boolean),
        description: mcpForm.description.trim(),
        enabled: mcpForm.enabled
      });
      setSelectedId("");
      return;
    }

    if (!skillForm.name.trim() || !skillForm.content.trim()) {
      setValidationMessage("请填写名称和内容。");
      return;
    }

    await onSave({
      id: skillForm.id || undefined,
      name: skillForm.name.trim(),
      description: skillForm.description.trim(),
      content: skillForm.content.trim(),
      tags: skillForm.tagsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      enabled: skillForm.enabled
    });
    setSelectedId("");
  }

  async function handleRefreshDiscoveries() {
    setRefreshingDiscoveries(true);
    setRefreshMessage("正在扫描本地来源…");

    try {
      await onRefreshDiscoveries();
      setRefreshMessage("已重新扫描本地来源。");
    } catch {
      setRefreshMessage("重新扫描失败。");
    } finally {
      setRefreshingDiscoveries(false);
    }
  }

  return (
    <div className="library-editor">
      <aside className="library-editor__list">
        <div className="library-editor__header">
          <span className="library-editor__eyebrow">{kind === "mcp" ? "MCP 列表" : "Skill 列表"}</span>
          <div className="library-editor__header-actions">
            <button
              className="ghost-button"
              disabled={refreshingDiscoveries}
              type="button"
              onClick={() => void handleRefreshDiscoveries()}
            >
              {refreshingDiscoveries ? "扫描中…" : "重新扫描"}
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setSelectedId("");
                setValidationMessage("");
                if (kind === "mcp") {
                  setMcpForm(emptyMcpForm);
                } else {
                  setSkillForm(emptySkillForm);
                }
              }}
            >
              {kind === "mcp" ? "新建 MCP" : "新建 Skill"}
            </button>
          </div>
        </div>
        {refreshMessage ? (
          <p aria-live="polite" className="empty-copy">
            {refreshMessage}
          </p>
        ) : null}

        <div className="library-editor__discoveries">
          <span className="library-editor__eyebrow">本地扫描</span>
          <div className="library-editor__items library-editor__discoveries-list">
            {discoveries.length === 0 ? (
              <p className="empty-copy">
                {kind === "mcp"
                  ? "未发现可导入的本地来源。当前支持扫描项目级 .mcp.json、.claude/.mcp.json、插件市场 ~/.claude/plugins/marketplaces 下的 .mcp.json，以及 Claude 配置中的 mcpServers。IDE 会话级 MCP 不在此列表。"
                  : "未发现可导入的本地来源。当前支持扫描 ~/.claude 下的 CLAUDE.md、commands、output-styles，项目级 .claude/commands、.claude/skills，以及 Claude 插件中的 commands、agents、skills。"}
              </p>
            ) : (
              discoveries.map((record) => (
                <div key={record.id} className="discovery-record">
                  <div className="discovery-record__copy">
                    <strong className="library-record__title">{record.name}</strong>
                    <span className="library-record__meta">{record.sourceLabel}</span>
                  </div>
                  <button
                    aria-label={`导入 ${record.name}`}
                    className="ghost-button discovery-record__action"
                    disabled={record.imported}
                    type="button"
                    onClick={() => void onImport(record)}
                  >
                    {record.imported ? "已导入" : "导入"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="library-editor__items library-editor__records">
          {records.length === 0 ? (
            <p key="empty-state" className="empty-copy">
              还没有任何记录。
            </p>
          ) : null}
          {records.map((record) => (
            <button
              key={record.id}
              className={`library-record ${record.id === selectedId ? "is-active" : ""}`}
              type="button"
              onClick={() => setSelectedId(record.id)}
            >
              <span className="library-record__title">{record.name}</span>
              <span className="library-record__meta">{record.enabled ? "Enabled" : "Disabled"}</span>
            </button>
          ))}
        </div>
      </aside>

      <form className="library-editor__form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="library-editor__form-body">
          {kind === "mcp" ? (
            <div className="library-editor__fields">
              <label className="field-stack">
                <span>名称</span>
                <input
                  aria-label="名称"
                  value={mcpForm.name}
                  onChange={(event) => setMcpForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="field-stack">
                <span>命令</span>
                <input
                  aria-label="命令"
                  value={mcpForm.command}
                  onChange={(event) => setMcpForm((current) => ({ ...current, command: event.target.value }))}
                />
              </label>
              <label className="field-stack">
                <span>参数</span>
                <input
                  aria-label="参数"
                  value={mcpForm.argsText}
                  onChange={(event) => setMcpForm((current) => ({ ...current, argsText: event.target.value }))}
                />
              </label>
              <label className="field-stack">
                <span>说明</span>
                <textarea
                  aria-label="说明"
                  rows={4}
                  value={mcpForm.description}
                  onChange={(event) => setMcpForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label className="checkbox-field">
                <input
                  checked={mcpForm.enabled}
                  type="checkbox"
                  onChange={(event) => setMcpForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span>启用</span>
              </label>
            </div>
          ) : (
            <div className="library-editor__fields">
              <label className="field-stack">
                <span>名称</span>
                <input
                  aria-label="名称"
                  value={skillForm.name}
                  onChange={(event) => setSkillForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label className="field-stack">
                <span>说明</span>
                <input
                  aria-label="说明"
                  value={skillForm.description}
                  onChange={(event) => setSkillForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
              <label className="field-stack">
                <span>标签</span>
                <input
                  aria-label="标签"
                  value={skillForm.tagsText}
                  onChange={(event) => setSkillForm((current) => ({ ...current, tagsText: event.target.value }))}
                />
              </label>
              <label className="field-stack">
                <span>内容</span>
                <textarea
                  aria-label="内容"
                  rows={6}
                  value={skillForm.content}
                  onChange={(event) => setSkillForm((current) => ({ ...current, content: event.target.value }))}
                />
              </label>
              <label className="checkbox-field">
                <input
                  checked={skillForm.enabled}
                  type="checkbox"
                  onChange={(event) => setSkillForm((current) => ({ ...current, enabled: event.target.checked }))}
                />
                <span>启用</span>
              </label>
            </div>
          )}

          {validationMessage ? <p className="field-error">{validationMessage}</p> : null}
        </div>

        <div className="library-editor__actions">
          <button className="primary-button" type="submit">
            {kind === "mcp" ? "保存 MCP" : "保存 Skill"}
          </button>
          {selectedRecord ? (
            <button
              className="ghost-button"
              type="button"
              onClick={() => void onDelete(selectedRecord.id).then(() => setSelectedId(""))}
            >
              删除
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
