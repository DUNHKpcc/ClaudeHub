import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../../src/renderer/App";

describe("App", () => {
  it("renders the installer heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "PClaude Installer" })).toBeInTheDocument();
  });
});
