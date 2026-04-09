import type { InstallResult } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";

type InstallableDependencyName = "node" | "git" | "claude";

const installableDependencies = new Set<InstallableDependencyName>(["node", "git", "claude"]);
const pendingStates = new Set<DependencyStatus["state"]>(["missing", "outdated"]);

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

export async function runInstallPlan(
  plan: InstallableDependencyName[]
): Promise<InstallResult> {
  return {
    ok: true,
    steps: plan.map((name) => ({
      name,
      state: "planned" as const
    }))
  };
}
