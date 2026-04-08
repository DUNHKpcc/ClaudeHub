import type { CSSProperties } from "react";

import type { ConnectivityResult } from "../../shared/contracts";

interface ConnectivityBannerProps {
  result: ConnectivityResult | null;
}

export function ConnectivityBanner({ result }: ConnectivityBannerProps) {
  if (!result) {
    return null;
  }

  return <div style={bannerStyle}>{result.message}</div>;
}

const bannerStyle: CSSProperties = {
  borderRadius: 16,
  padding: "14px 16px",
  background: "rgba(15, 23, 42, 0.72)",
  border: "1px solid rgba(148, 163, 184, 0.2)"
};
