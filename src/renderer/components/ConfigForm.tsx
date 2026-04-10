import type { CSSProperties, FormEvent } from "react";
import { useState } from "react";

import type { ConfigInput } from "../../shared/schemas";
import { supportedModels } from "../lib/models";

interface ConfigFormProps {
  onSubmit(input: ConfigInput): Promise<void>;
}

export function ConfigForm({ onSubmit }: ConfigFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState<(typeof supportedModels)[number]>(supportedModels[1]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!apiKey.trim()) {
      setValidationMessage("请输入 Anthropic API Key。");
      return;
    }

    setValidationMessage("");
    setIsSubmitting(true);

    try {
      await onSubmit({ apiKey, baseUrl, model });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <label style={fieldStyle}>
        <span style={labelStyle}>Anthropic API Key</span>
        <input
          aria-label="Anthropic API Key"
          type="password"
          required
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
            if (validationMessage) {
              setValidationMessage("");
            }
          }}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Base URL</span>
        <input
          aria-label="Base URL"
          type="url"
          placeholder="https://api.anthropic.com"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>模型</span>
        <select
          aria-label="模型"
          value={model}
          onChange={(event) => setModel(event.target.value as (typeof supportedModels)[number])}
          style={inputStyle}
        >
          {supportedModels.map((supportedModel) => (
            <option key={supportedModel} value={supportedModel}>
              {supportedModel}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={isSubmitting} style={buttonStyle}>
        保存配置
      </button>

      {validationMessage ? <p style={validationStyle}>{validationMessage}</p> : null}
    </form>
  );
}

const formStyle: CSSProperties = {
  display: "grid",
  gap: 10
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#cccccc"
};

const inputStyle: CSSProperties = {
  border: "1px solid #3c3c3c",
  borderRadius: 8,
  background: "#1f1f1f",
  color: "#cccccc",
  padding: "8px 10px",
  font: "inherit"
};

const buttonStyle: CSSProperties = {
  justifySelf: "start",
  border: "1px solid #3c3c3c",
  borderRadius: 8,
  background: "#2d2d30",
  color: "#ffffff",
  padding: "8px 12px",
  font: "inherit",
  fontWeight: 600,
  cursor: "pointer"
};

const validationStyle: CSSProperties = {
  margin: 0,
  color: "#ffffff",
  fontSize: 12
};
