import type { InstallProgressEvent } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";

export function localizeDependencyName(name: DependencyStatus["name"] | InstallProgressEvent["dependency"]): string {
  switch (name) {
    case "node":
      return "Node.js";
    case "npm":
      return "npm";
    case "git":
      return "Git";
    case "claude":
      return "Claude Code";
    case "mcp_market":
      return "MCP 市场";
    case "skill_market":
      return "Skill 市场";
    default:
      return String(name);
  }
}

export function localizeDependencyState(state: DependencyStatus["state"]): string {
  switch (state) {
    case "installed":
      return "已安装";
    case "missing":
      return "缺失";
    case "outdated":
      return "版本过低";
    case "broken":
      return "异常";
    default:
      return state;
  }
}

export function localizeInstallState(state: "completed" | "failed"): string {
  return state === "completed" ? "已完成" : "失败";
}

export function localizeInstallStage(stage: InstallProgressEvent["stage"]): string {
  switch (stage) {
    case "queued":
      return "排队中";
    case "downloading":
      return "下载中";
    case "installing":
      return "安装中";
    case "verifying":
      return "校验中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "manual":
      return "需手动处理";
    default:
      return stage;
  }
}

export function localizeMessage(message: string): string {
  const trimmed = message.trim();

  const dependencyMissing = trimmed.match(/^(node|npm|git|claude) is missing\.$/u);
  if (dependencyMissing) {
    return `${localizeDependencyName(dependencyMissing[1] as DependencyStatus["name"])} 未安装。`;
  }

  const dependencyNotFound = trimmed.match(/^(node|npm|git|claude) was not found on PATH\.$/u);
  if (dependencyNotFound) {
    return `${localizeDependencyName(dependencyNotFound[1] as DependencyStatus["name"])} 未出现在 PATH 中。`;
  }

  const installedOfficial = trimmed.match(/^Installed (node|git|claude) from the official source\.$/u);
  if (installedOfficial) {
    return `已从官方源安装 ${localizeDependencyName(installedOfficial[1] as DependencyStatus["name"])}。`;
  }

  const installedAli = trimmed.match(/^Installed (node|git|claude) using the Ali mirror fallback\.$/u);
  if (installedAli) {
    return `已通过阿里镜像备用源安装 ${localizeDependencyName(installedAli[1] as DependencyStatus["name"])}。`;
  }

  if (trimmed === "Installed git using the official installer fallback.") {
    return "已通过官方安装器备用方案安装 Git。";
  }

  if (trimmed === "Manual install required for git.") {
    return "Git 需要手动安装。";
  }

  if (trimmed === "Manual install required for git on macOS. Install Xcode Command Line Tools or Homebrew Git.") {
    return "macOS 需要手动安装 Git，请安装 Xcode Command Line Tools 或 Homebrew Git。";
  }

  if (trimmed === "Git still requires a manual install on macOS. Use Xcode Command Line Tools or Homebrew Git.") {
    return "Git 在 macOS 上仍需手动安装，请使用 Xcode Command Line Tools 或 Homebrew Git。";
  }

  const downloadingOfficial = trimmed.match(/^Downloading node from the official source \(attempt (\d+)\/(\d+)\)\.\.\.$/u);
  if (downloadingOfficial) {
    return `正在从官方源下载 Node.js（第 ${downloadingOfficial[1]}/${downloadingOfficial[2]} 次尝试）。`;
  }

  if (trimmed === "Downloading node from the official source...") {
    return "正在从官方源下载 Node.js...";
  }

  const downloadingAli = trimmed.match(/^Downloading node from the ali source \(attempt (\d+)\/(\d+)\)\.\.\.$/u);
  if (downloadingAli) {
    return `正在从阿里镜像下载 Node.js（第 ${downloadingAli[1]}/${downloadingAli[2]} 次尝试）。`;
  }

  if (trimmed === "Downloading node from the ali source...") {
    return "正在从阿里镜像下载 Node.js...";
  }

  if (trimmed === "Official node download failed. Retrying with the Ali mirror...") {
    return "Node.js 官方源下载失败，正在切换到阿里镜像重试。";
  }

  if (trimmed === "Official node download failed. Retrying...") {
    return "Node.js 官方源下载失败，正在重试。";
  }

  if (trimmed === "Ali mirror node download failed. Retrying...") {
    return "Node.js 阿里镜像下载失败，正在重试。";
  }

  if (trimmed === "Installing Node.js on Windows...") {
    return "正在安装 Windows 版 Node.js。";
  }

  if (trimmed === "Installing Node.js on macOS...") {
    return "正在安装 macOS 版 Node.js。";
  }

  if (trimmed === "Installing Git with winget...") {
    return "正在通过 winget 安装 Git。";
  }

  if (trimmed === "winget install failed. Downloading the official Git installer...") {
    return "winget 安装失败，正在下载官方 Git 安装器。";
  }

  if (trimmed === "Running the Git for Windows installer...") {
    return "正在运行 Git for Windows 安装器。";
  }

  if (trimmed === "Installing Claude Code with the official Windows script...") {
    return "正在通过官方 Windows 脚本安装 Claude Code。";
  }

  if (trimmed === "Installing Claude Code with the official shell script...") {
    return "正在通过官方脚本安装 Claude Code。";
  }

  const preparing = trimmed.match(/^Preparing (node|git|claude) installation\.\.\.$/u);
  if (preparing) {
    return `准备安装 ${localizeDependencyName(preparing[1] as DependencyStatus["name"])}。`;
  }

  const verifying = trimmed.match(/^Verifying (node|git|claude) after installation\.\.\.$/u);
  if (verifying) {
    return `正在校验 ${localizeDependencyName(verifying[1] as DependencyStatus["name"])} 安装结果。`;
  }

  if (trimmed === "Connectivity check succeeded.") {
    return "连通性检查通过。";
  }

  const connectivityStatus = trimmed.match(/^Connectivity check failed with status (\d+)\.$/u);
  if (connectivityStatus) {
    return `连通性检查失败，状态码 ${connectivityStatus[1]}。`;
  }

  if (trimmed === "Authentication failed. Check your API key.") {
    return "鉴权失败，请检查 API Key。";
  }

  if (trimmed === "Base URL must be a valid URL.") {
    return "Base URL 必须是合法地址。";
  }

  if (trimmed === "API key is required.") {
    return "请输入 API Key。";
  }

  if (trimmed === "Claude configuration is missing.") {
    return "缺少 Claude 配置。";
  }

  if (trimmed === "Claude Code was not found on PATH. Re-run install or restart PClaude Installer.") {
    return "PATH 中未找到 Claude Code，请重新安装或重启 PClaude Installer。";
  }

  if (trimmed === "save failed") {
    return "保存失败";
  }

  if (trimmed === "Node verification failed after installation.") {
    return "Node.js 安装后校验失败。";
  }

  return trimmed;
}
