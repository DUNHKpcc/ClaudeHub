import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");

function readProjectFile(relativePath: string) {
  return readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readCssBlock(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "m"));

  return match?.[1] ?? "";
}

describe("layout regression guards", () => {
  it("uses a roomy default BrowserWindow size instead of the old cramped 820x560 shell", () => {
    const source = readProjectFile("src/main/index.ts");
    const width = Number(source.match(/width:\s*(\d+)/)?.[1] ?? "0");
    const height = Number(source.match(/height:\s*(\d+)/)?.[1] ?? "0");
    const minWidth = Number(source.match(/minWidth:\s*(\d+)/)?.[1] ?? "0");
    const minHeight = Number(source.match(/minHeight:\s*(\d+)/)?.[1] ?? "0");

    expect(width).toBeGreaterThanOrEqual(1100);
    expect(height).toBeGreaterThanOrEqual(760);
    expect(minWidth).toBeGreaterThanOrEqual(980);
    expect(minHeight).toBeGreaterThanOrEqual(680);
  });

  it("keeps the renderer shell fluid instead of pinning it to 820x560", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const shellBlock = readCssBlock(source, ".claudehub-shell");

    expect(shellBlock).not.toMatch(/width:\s*820px/);
    expect(shellBlock).not.toMatch(/height:\s*560px/);
    expect(shellBlock).toMatch(/width:\s*100%/);
    expect(shellBlock).toMatch(/height:\s*100%/);
  });

  it("prevents single overview sections from stretching cards to fill the full column height", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const sectionBodyBlock = readCssBlock(source, ".section-body");

    expect(sectionBodyBlock).toMatch(/align-content:\s*start/);
    expect(sectionBodyBlock).toMatch(/align-items:\s*start/);
  });

  it("uses one shared sans-serif stack for Chinese and English inside the right detail panel", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const mainBlock = readCssBlock(source, ".claudehub-main");

    expect(mainBlock).toMatch(/font-family:\s*"PingFang SC"/);
    expect(mainBlock).toMatch(/"SF Pro SC"/);
  });

  it("renders English toolbar labels with a semibold sans-serif stack", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const railLabelBlock = readCssBlock(source, ".rail-button__label");

    expect(railLabelBlock).toMatch(/font-family:\s*"PingFang SC"/);
    expect(railLabelBlock).toMatch(/font-weight:\s*600/);
  });
});
