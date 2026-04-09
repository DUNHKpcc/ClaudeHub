import type { InstallResult } from "../../shared/contracts";
import type { DependencyStatus } from "../../shared/schemas";

type InstallableDependencyName = "node" | "git" | "claude";

const installableDependencies = new Set<InstallableDependencyName>(["node", "git", "claude"]);
const pendingStates = new Set<DependencyStatus["state"]>(["missing", "outdated"]);

export function buildInstallPlan(dependencies: DependencyStatus[]): InstallableDependencyName[] {
  return dependencies.flatMap((dependency) => {
    if (!installableDependencies.has(dependency.name as InstallableDependencyName)) {
      return [];
    }

    if (!pendingStates.has(dependency.state)) {
      return [];
    }

    return [dependency.name as InstallableDependencyName];
  });
}

export async function runInstallPlan(
  plan: InstallableDependencyName[]
): Promise<InstallResult> {
  return {
    ok: true,
    steps: plan.map((name) => ({
      name,
      state: "completed" as const
    }))
  };
}
