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
  it("uses a narrower default BrowserWindow width without shrinking the usable renderer canvas", () => {
    const source = readProjectFile("src/main/index.ts");
    const width = Number(source.match(/width:\s*(\d+)/)?.[1] ?? "0");
    const height = Number(source.match(/height:\s*(\d+)/)?.[1] ?? "0");
    const minWidth = Number(source.match(/minWidth:\s*(\d+)/)?.[1] ?? "0");
    const minHeight = Number(source.match(/minHeight:\s*(\d+)/)?.[1] ?? "0");

    expect(width).toBe(1088);
    expect(height).toBe(860);
    expect(minWidth).toBe(918);
    expect(minHeight).toBe(760);
  });

  it("keeps the renderer shell full-width so the app does not introduce side gutters", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const shellBlock = readCssBlock(source, ".claudehub-shell");
    const mobileShellOverride = source.match(
      /@media \(max-width:\s*820px\)\s*\{[\s\S]*?\.claudehub-shell\s*\{([\s\S]*?)\}/m
    )?.[1] ?? "";

    expect(shellBlock).not.toMatch(/width:\s*820px/);
    expect(shellBlock).not.toMatch(/height:\s*560px/);
    expect(shellBlock).toMatch(/width:\s*100%/);
    expect(shellBlock).toMatch(/height:\s*100%/);
    expect(shellBlock).not.toMatch(/margin:\s*0 auto/);
    expect(mobileShellOverride).toMatch(/width:\s*100%/);
  });

  it("prevents single overview sections from stretching cards to fill the full column height", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const sectionBodyBlock = readCssBlock(source, ".section-body");

    expect(sectionBodyBlock).toMatch(/align-content:\s*start/);
    expect(sectionBodyBlock).toMatch(/align-items:\s*start/);
  });

  it("keeps the main detail column scrollable without showing a visible scrollbar", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const sectionBodyBlock = readCssBlock(source, ".section-body");
    const webkitScrollbarBlock = readCssBlock(source, ".section-body::-webkit-scrollbar");

    expect(sectionBodyBlock).toMatch(/overflow:\s*auto/);
    expect(sectionBodyBlock).toMatch(/scrollbar-width:\s*none/);
    expect(webkitScrollbarBlock).toMatch(/width:\s*0/);
    expect(webkitScrollbarBlock).toMatch(/height:\s*0/);
  });

  it("keeps the current status metric card on its own full-width row", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const statusRowBlock = readCssBlock(source, ".metric-card--full-row");
    const configMetricGridBlock = readCssBlock(source, ".metric-grid--config");
    const statusSplitBlock = readCssBlock(source, ".metric-card__split");
    const statusAsideBlock = readCssBlock(source, ".metric-card__aside");
    const statusMetaBlock = readCssBlock(source, ".metric-card__meta");
    const statusMetaValueBlock = readCssBlock(source, ".metric-card__meta-value");

    expect(configMetricGridBlock).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
    expect(statusRowBlock).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(statusSplitBlock).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*auto/);
    expect(statusAsideBlock).toMatch(/display:\s*flex/);
    expect(statusAsideBlock).toMatch(/flex-wrap:\s*nowrap/);
    expect(statusMetaBlock).toMatch(/display:\s*flex/);
    expect(statusMetaBlock).toMatch(/align-items:\s*center/);
    expect(statusMetaValueBlock).toMatch(/display:\s*inline-flex/);
    expect(statusMetaValueBlock).toMatch(/align-items:\s*center/);
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

  it("keeps the token summary row unframed so only the four inner metric cards are boxed", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const summaryBlock = readCssBlock(source, ".token-panel__summary");
    const sharedPanelGroup = source.match(
      /\.library-editor__list,\s*\.library-editor__form,\s*[\s\S]*?\.token-panel__table\s*\{([\s\S]*?)\}/m
    )?.[0] ?? "";

    expect(sharedPanelGroup).not.toContain(".token-panel__summary");
    expect(summaryBlock).toMatch(/display:\s*grid/);
    expect(summaryBlock).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
    expect(summaryBlock).not.toMatch(/background:/);
    expect(summaryBlock).not.toMatch(/border:/);
    expect(summaryBlock).not.toMatch(/border-radius:/);
    expect(summaryBlock).not.toMatch(/padding:/);
  });

  it("keeps library discovery and record lists inside fixed-height scrolling panels", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const editorBlock = readCssBlock(source, ".library-editor");
    const listBlock = readCssBlock(source, ".library-editor__list");
    const discoveriesBlock = readCssBlock(source, ".library-editor__discoveries-list");
    const recordsBlock = readCssBlock(source, ".library-editor__records");
    const formBlock = readCssBlock(source, ".library-editor__form");
    const formBodyBlock = readCssBlock(source, ".library-editor__form-body");

    expect(editorBlock).toMatch(/min-height:\s*clamp\(/);
    expect(editorBlock).toMatch(/height:\s*min\(760px,\s*calc\(100vh - 220px\)\)/);
    expect(editorBlock).toMatch(/max-height:\s*calc\(100vh - 220px\)/);
    expect(listBlock).toMatch(/grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) minmax\(0,\s*1fr\)/);
    expect(listBlock).toMatch(/overflow:\s*hidden/);
    expect(discoveriesBlock).toMatch(/overflow:\s*auto/);
    expect(recordsBlock).toMatch(/overflow:\s*auto/);
    expect(formBlock).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\) auto/);
    expect(formBlock).toMatch(/overflow:\s*hidden/);
    expect(formBodyBlock).toMatch(/overflow:\s*auto/);
  });

  it("keeps discovery action buttons single-line with a consistent minimum width", () => {
    const source = readProjectFile("src/renderer/styles.css");
    const actionBlock = readCssBlock(source, ".discovery-record__action");

    expect(actionBlock).toMatch(/width:\s*92px/);
    expect(actionBlock).toMatch(/white-space:\s*nowrap/);
    expect(actionBlock).toMatch(/justify-content:\s*center/);
    expect(actionBlock).toMatch(/flex:\s*0 0 92px/);
  });
});
