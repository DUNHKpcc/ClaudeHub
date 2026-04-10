import type { CSSProperties } from "react";

import type { ConnectivityResult } from "../../shared/contracts";
import { localizeMessage } from "../lib/ui-copy";

interface ConnectivityBannerProps {
  result: ConnectivityResult | null;
}

export function ConnectivityBanner({ result }: ConnectivityBannerProps) {
  if (!result) {
    return null;
  }

  return <div style={bannerStyle}>{localizeMessage(result.message)}</div>;
}

const bannerStyle: CSSProperties = {
  borderRadius: 8,
  padding: "10px 12px",
  background: "#1f1f1f",
  border: "1px solid #3c3c3c",
  color: "#cccccc",
  fontSize: 12,
  lineHeight: 1.5
};
