import type { CSSProperties, FormEvent } from "react";
import { useEffect, useState } from "react";

import type { ConfigInput } from "../../shared/schemas";

interface ConfigFormProps {
  initialValue?: Partial<ConfigInput> | null;
  placeholderValue?: Partial<ConfigInput> | null;
  onSubmit(input: ConfigInput): Promise<void>;
}

export function ConfigForm({ initialValue, placeholderValue, onSubmit }: ConfigFormProps) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [apiKeyDirty, setApiKeyDirty] = useState(false);
  const [baseUrlDirty, setBaseUrlDirty] = useState(false);
  const [modelDirty, setModelDirty] = useState(false);

  useEffect(() => {
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setApiKeyDirty(false);
    setBaseUrlDirty(false);
    setModelDirty(false);
  }, [initialValue, placeholderValue]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const resolvedApiKey = apiKeyDirty
      ? apiKey.trim()
      : initialValue?.apiKey?.trim() || placeholderValue?.apiKey?.trim() || "";
    const resolvedBaseUrl = baseUrlDirty
      ? baseUrl.trim()
      : initialValue?.baseUrl?.trim() || placeholderValue?.baseUrl?.trim() || "";
    const resolvedModel = modelDirty
      ? model.trim()
      : initialValue?.model?.trim() || placeholderValue?.model?.trim() || "claude-sonnet-4-20250514";

    if (!resolvedApiKey) {
      setValidationMessage("请输入 Anthropic API Key。");
      return;
    }

    if (!resolvedModel) {
      setValidationMessage("请输入模型 ID。");
      return;
    }

    setValidationMessage("");
    setIsSubmitting(true);

    try {
      await onSubmit({ apiKey: resolvedApiKey, baseUrl: resolvedBaseUrl, model: resolvedModel });
    } finally {
      setIsSubmitting(false);
    }
  }

  const apiKeyPlaceholder = buildMaskedApiKeyPlaceholder(placeholderValue?.apiKey ?? initialValue?.apiKey);
  const baseUrlPlaceholder = placeholderValue?.baseUrl?.trim() || initialValue?.baseUrl?.trim() || "https://api.anthropic.com";
  const modelPlaceholder = placeholderValue?.model?.trim() || initialValue?.model?.trim() || "例如：claude-sonnet-4-20250514";

  return (
    <form onSubmit={handleSubmit} style={formStyle}>
      <label style={fieldStyle}>
        <span style={labelStyle}>Anthropic API Key</span>
        <input
          aria-label="Anthropic API Key"
          type="password"
          value={apiKey}
          placeholder={apiKeyPlaceholder}
          onChange={(event) => {
            setApiKeyDirty(true);
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
          placeholder={baseUrlPlaceholder}
          value={baseUrl}
          onChange={(event) => {
            setBaseUrlDirty(true);
            setBaseUrl(event.target.value);
          }}
          style={inputStyle}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>模型 ID</span>
        <input
          aria-label="模型 ID"
          type="text"
          placeholder={modelPlaceholder}
          value={model}
          onChange={(event) => {
            setModelDirty(true);
            setModel(event.target.value);
          }}
          style={inputStyle}
        />
      </label>

      <button type="submit" disabled={isSubmitting} style={buttonStyle}>
        保存配置
      </button>

      {validationMessage ? <p style={validationStyle}>{validationMessage}</p> : null}
    </form>
  );
}

function buildMaskedApiKeyPlaceholder(value?: string | null) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  if (normalized.length <= 8) {
    return "已保存 API Key";
  }

  return `${normalized.slice(0, 7)}...${normalized.slice(-4)}`;
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
