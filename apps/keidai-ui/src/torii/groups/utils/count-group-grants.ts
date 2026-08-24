import type { GroupServerPolicyView } from "@keidai/shared";
import type { CatalogueTool, ServerCatalogue } from "../types/group-editor.js";
import { isPermitted, resolveEffectivePermission } from "./resolve-tool-effect.js";
import { listUnruledTools } from "./list-explicit-rules.js";

export interface GroupGrantCounts {
  allowed: number;
  gated: number;
  total: number;
  /** False when any reached server is missing a catalogue — hide "of M" / "N left". */
  catalogueComplete: boolean;
}

export function countServerGrants(
  policy: GroupServerPolicyView,
  catalogue: readonly CatalogueTool[] | undefined,
): { reachable: number; gated: number; total: number | null } {
  if (!catalogue) {
    const explicitGated = policy.gated.length;
    const explicitAllowed = policy.allow.length + explicitGated;
    return {
      reachable: explicitAllowed,
      gated: explicitGated,
      total: null,
    };
  }

  let reachable = 0;
  let gated = 0;
  for (const tool of catalogue) {
    const effect = resolveEffectivePermission(policy, tool.name);
    if (isPermitted(effect)) {
      reachable += 1;
    }
    if (effect === "gated") {
      gated += 1;
    }
  }
  return { reachable, gated, total: catalogue.length };
}

export function countGroupGrants(
  policies: readonly GroupServerPolicyView[],
  catalogues: Readonly<Record<string, ServerCatalogue | undefined>>,
): GroupGrantCounts {
  let allowed = 0;
  let gated = 0;
  let total = 0;
  let catalogueComplete = true;

  for (const policy of policies) {
    const catalogue = catalogues[policy.server];
    if (!catalogue?.available) {
      catalogueComplete = false;
    }
    const counted = countServerGrants(
      policy,
      catalogue?.available ? catalogue.tools : undefined,
    );
    allowed += counted.reachable;
    gated += counted.gated;
    if (counted.total !== null) {
      total += counted.total;
    }
  }

  return { allowed, gated, total, catalogueComplete };
}

export function unruledToolCount(
  policy: GroupServerPolicyView,
  catalogue: readonly CatalogueTool[] | undefined,
): number | null {
  if (!catalogue) {
    return null;
  }
  return listUnruledTools(policy, catalogue).length;
}
