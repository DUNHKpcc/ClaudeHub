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
      setValidationMessage("Anthropic API Key is required.");
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
        <span style={labelStyle}>Model</span>
        <select
          aria-label="Model"
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
        Save Configuration
      </button>

      {validationMessage ? <p style={validationStyle}>{validationMessage}</p> : null}
    </form>
  );
}

const formStyle: CSSProperties = {
  display: "grid",
  gap: 16
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 8
};

const labelStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600
};

const inputStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  background: "rgba(15, 23, 42, 0.85)",
  color: "inherit",
  padding: "12px 14px",
  font: "inherit"
};

const buttonStyle: CSSProperties = {
  justifySelf: "start",
  border: "none",
  borderRadius: 999,
  background: "#8b5cf6",
  color: "#fff",
  padding: "12px 18px",
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer"
};

const validationStyle: CSSProperties = {
  margin: 0,
  color: "#fca5a5",
  fontSize: 14
};
