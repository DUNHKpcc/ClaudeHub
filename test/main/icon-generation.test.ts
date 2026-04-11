import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "../..");
const sourceScript = join(repoRoot, "scripts/generate_icons.py");

function sha1(path: string): string {
  return createHash("sha1").update(readFileSync(path)).digest("hex");
}

function readPngSize(path: string): { width: number; height: number } {
  const buffer = readFileSync(path);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

describe("generate_icons.py", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("derives icon assets from the checked-in 1024px source image", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "icon-generation-"));
    tempDirs.push(tempRoot);

    const tempScriptsDir = join(tempRoot, "scripts");
    const tempIconDir = join(tempRoot, "build/icons");
    mkdirSync(tempScriptsDir, { recursive: true });
    mkdirSync(tempIconDir, { recursive: true });
    cpSync(sourceScript, join(tempScriptsDir, "generate_icons.py"));

    execFileSync("python3", [
      "-c",
      [
        "from pathlib import Path",
        "from PIL import Image",
        `output = Path(${JSON.stringify(join(tempIconDir, "icon-1024.png"))})`,
        'Image.new("RGBA", (1024, 1024), (12, 34, 56, 255)).save(output)'
      ].join("; ")
    ]);

    const originalSourceHash = sha1(join(tempIconDir, "icon-1024.png"));

    execFileSync("python3", [join(tempScriptsDir, "generate_icons.py")], {
      cwd: tempRoot
    });

    const generatedMaster = join(tempIconDir, "icon.png");
    const sourceMaster = join(tempIconDir, "icon-1024.png");

    expect(existsSync(generatedMaster)).toBe(true);
    expect(sha1(sourceMaster)).toBe(originalSourceHash);
    expect(sha1(generatedMaster)).toBe(originalSourceHash);

    expect(readPngSize(join(tempIconDir, "icon-512.png"))).toEqual({ width: 512, height: 512 });
    expect(readPngSize(join(tempIconDir, "icon-16.png"))).toEqual({ width: 16, height: 16 });
    expect(statSync(join(tempIconDir, "icon.ico")).size).toBeGreaterThan(0);
    expect(statSync(join(tempIconDir, "icon.icns")).size).toBeGreaterThan(0);
  });
});
