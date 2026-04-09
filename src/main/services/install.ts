import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InstallProgressEvent, InstallResult } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";
import { detectEnvironment } from "./environment";

type InstallableDependencyName = "node" | "git" | "claude";
type InstallStepResult = InstallResult["steps"][number];
type InstallSourceLabel = "official" | "ali";
type InstallProgressReporter = (event: InstallProgressEvent) => void;

interface DownloadSource {
  fileName: string;
  label: InstallSourceLabel;
  url: string;
}

const installableDependencies = new Set<InstallableDependencyName>(["node", "git", "claude"]);
const pendingStates = new Set<DependencyStatus["state"]>(["missing", "outdated"]);

const NODE_VERSION = "22.22.2";
const GIT_WINDOWS_VERSION = "2.53.0.2";
const TEMP_INSTALL_DIR = "pclaude-installer";

export function buildInstallPlan(dependencies: DependencyStatus[]): InstallableDependencyName[] {
  const plan = new Set<InstallableDependencyName>();

  const needsNode =
    dependencies.some((dependency) => dependency.name === "node" && pendingStates.has(dependency.state)) ||
    dependencies.some((dependency) => dependency.name === "npm" && pendingStates.has(dependency.state));

  if (needsNode) {
    plan.add("node");
  }

  for (const dependency of dependencies) {
    if (!installableDependencies.has(dependency.name as InstallableDependencyName)) {
      continue;
    }

    if (!pendingStates.has(dependency.state)) {
      continue;
    }

    if (dependency.name !== "node") {
      plan.add(dependency.name as InstallableDependencyName);
    }
  }

  return Array.from(plan);
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

function formatSourceMessage(name: InstallableDependencyName, label: InstallSourceLabel): string {
  if (label === "official") {
    return `Installed ${name} from the official source.`;
  }

  return `Installed ${name} using the Ali mirror fallback.`;
}

function emitProgress(
  report: InstallProgressReporter | undefined,
  dependency: InstallableDependencyName,
  stage: InstallProgressEvent["stage"],
  message: string
) {
  report?.({ dependency, stage, message });
}

function buildNodeSources(platform: NodeJS.Platform, arch: string): DownloadSource[] {
  const fileName =
    platform === "win32"
      ? `node-v${NODE_VERSION}-${arch}.msi`
      : `node-v${NODE_VERSION}.pkg`;

  return [
    {
      fileName,
      label: "official",
      url: `https://nodejs.org/download/release/v${NODE_VERSION}/${fileName}`
    },
    {
      fileName,
      label: "ali",
      url: `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/${fileName}`
    }
  ];
}

function buildGitWindowsSource(arch: string): DownloadSource {
  const fileName =
    arch === "arm64"
      ? `Git-${GIT_WINDOWS_VERSION}-arm64.exe`
      : `Git-${GIT_WINDOWS_VERSION}-64-bit.exe`;

  return {
    fileName,
    label: "official",
    url: `https://github.com/git-for-windows/git/releases/download/v${GIT_WINDOWS_VERSION.replace(/\.([0-9]+)$/u, ".windows.$1")}/${fileName}`
  };
}

async function downloadInstaller(
  dependency: InstallableDependencyName,
  sources: DownloadSource[],
  report?: InstallProgressReporter
): Promise<{ label: InstallSourceLabel; filePath: string }> {
  const installDir = path.join(os.tmpdir(), TEMP_INSTALL_DIR);
  await fs.mkdir(installDir, { recursive: true });

  let lastError: Error | null = null;

  for (const source of sources) {
    try {
      emitProgress(report, dependency, "downloading", `Downloading ${dependency} from the ${source.label} source...`);
      const response = await fetch(source.url);

      if (!response.ok) {
        throw new Error(`Download failed with status ${response.status}.`);
      }

      const filePath = path.join(installDir, source.fileName);
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      return {
        label: source.label,
        filePath
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Download failed.");

      if (source.label === "official" && sources.some((candidate) => candidate.label === "ali")) {
        emitProgress(
          report,
          dependency,
          "downloading",
          `Official ${dependency} download failed. Retrying with the Ali mirror...`
        );
      }
    }
  }

  throw lastError ?? new Error("Download failed.");
}

async function verifyInstalled(name: InstallableDependencyName, report?: InstallProgressReporter): Promise<void> {
  emitProgress(report, name, "verifying", `Verifying ${name} after installation...`);
  const environment = await detectEnvironment();
  const dependencies = environment.dependencies.filter((dependency) =>
    name === "node" ? dependency.name === "node" || dependency.name === "npm" : dependency.name === name
  );

  if (dependencies.some((dependency) => dependency.state !== "installed")) {
    throw new Error(`${name} verification failed after installation.`);
  }
}

async function installNode(report?: InstallProgressReporter): Promise<InstallStepResult> {
  const platform = os.platform();
  const arch = os.arch();
  const download = await downloadInstaller("node", buildNodeSources(platform, arch), report);

  try {
    if (platform === "win32") {
      emitProgress(report, "node", "installing", "Installing Node.js on Windows...");
      await runCommand("msiexec.exe", ["/i", download.filePath, "/qn", "/norestart"]);
    } else if (platform === "darwin") {
      emitProgress(report, "node", "installing", "Installing Node.js on macOS...");
      await runCommand("/usr/sbin/installer", ["-pkg", download.filePath, "-target", "/"]);
    } else {
      throw new Error(`Unsupported platform for node installation: ${platform}.`);
    }

    await verifyInstalled("node", report);

    return {
      name: "node",
      state: "completed",
      message: formatSourceMessage("node", download.label)
    };
  } finally {
    await fs.rm(download.filePath, { force: true });
  }
}

async function installGit(report?: InstallProgressReporter): Promise<InstallStepResult> {
  const platform = os.platform();

  if (platform !== "win32") {
    emitProgress(
      report,
      "git",
      "manual",
      "Git still requires a manual install on macOS. Use Xcode Command Line Tools or Homebrew Git."
    );
    return {
      name: "git",
      state: "failed",
      message: "Manual install required for git on macOS. Install Xcode Command Line Tools or Homebrew Git."
    };
  }

  try {
    emitProgress(report, "git", "installing", "Installing Git with winget...");
    await runCommand("winget", [
      "install",
      "--id",
      "Git.Git",
      "-e",
      "--source",
      "winget",
      "--accept-package-agreements",
      "--accept-source-agreements",
      "--disable-interactivity"
    ]);

    await verifyInstalled("git", report);

    return {
      name: "git",
      state: "completed",
      message: formatSourceMessage("git", "official")
    };
  } catch {
    emitProgress(report, "git", "downloading", "winget install failed. Downloading the official Git installer...");
    const download = await downloadInstaller("git", [buildGitWindowsSource(os.arch())], report);

    try {
      emitProgress(report, "git", "installing", "Running the Git for Windows installer...");
      await runCommand(download.filePath, ["/VERYSILENT", "/NORESTART", "/SP-"]);
      await verifyInstalled("git", report);

      return {
        name: "git",
        state: "completed",
        message: "Installed git using the official installer fallback."
      };
    } finally {
      await fs.rm(download.filePath, { force: true });
    }
  }
}

async function installClaude(report?: InstallProgressReporter): Promise<InstallStepResult> {
  const platform = os.platform();
  const isWindows = platform === "win32";

  emitProgress(
    report,
    "claude",
    "installing",
    isWindows ? "Installing Claude Code with the official Windows script..." : "Installing Claude Code with the official shell script..."
  );
  await runCommand(
    isWindows ? "powershell" : "bash",
    isWindows
      ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "irm https://claude.ai/install.ps1 | iex"]
      : ["-lc", "curl -fsSL https://claude.ai/install.sh | bash"]
  );

  await verifyInstalled("claude", report);

  return {
    name: "claude",
    state: "completed",
    message: formatSourceMessage("claude", "official")
  };
}

export async function runInstallPlan(
  plan: InstallableDependencyName[],
  report?: InstallProgressReporter
): Promise<InstallResult> {
  const steps: InstallStepResult[] = [];

  for (const name of plan) {
    try {
      emitProgress(report, name, "queued", `Preparing ${name} installation...`);
      const step =
        name === "node"
          ? await installNode(report)
          : name === "git"
            ? await installGit(report)
            : await installClaude(report);

      steps.push(step);
      emitProgress(report, name, step.state, step.message ?? `${name} installed.`);
    } catch (error) {
      const failure = {
        name,
        state: "failed",
        message: error instanceof Error ? error.message : `${name} installation failed.`
      } as const;

      steps.push(failure);
      emitProgress(report, name, "failed", failure.message);
    }
  }

  return {
    ok: steps.every((step) => step.state === "completed"),
    steps
  };
}
