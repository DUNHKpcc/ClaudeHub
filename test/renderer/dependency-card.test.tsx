import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DependencyCard } from "../../src/renderer/components/DependencyCard";

describe("DependencyCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the matching dependency logo beside the title", () => {
    render(
      <DependencyCard
        dependency={{
          name: "node",
          state: "installed",
          version: "25.7.0",
          path: "/usr/local/bin/node"
        }}
      />
    );

    expect(screen.getByRole("img", { name: "Node.js logo" })).toBeInTheDocument();
  });

  it("keeps the card height fixed and scrolls long detail content internally", () => {
    render(
      <DependencyCard
        dependency={{
          name: "git",
          state: "broken",
          version: "2.50.1",
          path: "/very/long/path/that/should/not/expand/the/card/beyond/its/fixed/height/git",
          message:
            "This is a long diagnostics message intended to verify that the details region stays scrollable instead of stretching the overall card height."
        }}
      />
    );

    const card = screen.getByRole("article");
    const details = screen.getByTestId("dependency-details");

    expect(card).toHaveStyle({ height: "136px" });
    expect(details).toHaveStyle({ overflowY: "auto" });
  });

  it("renders the installed badge in green", () => {
    render(
      <DependencyCard
        dependency={{
          name: "npm",
          state: "installed",
          version: "11.10.1",
          path: "/usr/local/bin/npm"
        }}
      />
    );

    expect(screen.getByText("已安装")).toHaveStyle({
      color: "#7fdc9a",
      borderColor: "#2f8f59"
    });
  });
});
