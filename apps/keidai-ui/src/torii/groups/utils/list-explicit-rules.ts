import type { GroupServerPolicyView } from "@keidai/shared";
import type {
  CatalogueTool,
  ExplicitToolRule,
} from "../types/group-editor.js";
import { resolveEffectivePermission } from "./resolve-tool-effect.js";

const STALE_DESCRIPTION = "Not currently advertised";

function namedTools(policy: GroupServerPolicyView): Set<string> {
  return new Set([...policy.allow, ...policy.deny, ...policy.gated]);
}

function firstSeenOrder(policy: GroupServerPolicyView): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const tool of [...policy.allow, ...policy.deny, ...policy.gated]) {
    if (seen.has(tool)) {
      continue;
    }
    seen.add(tool);
    ordered.push(tool);
  }
  return ordered;
}

/** Rule rows are policy-named tools only — never the full catalogue. */
export function listExplicitRules(
  policy: GroupServerPolicyView,
  catalogue: readonly CatalogueTool[] = [],
): ExplicitToolRule[] {
  const named = namedTools(policy);
  const advertised = new Map(catalogue.map((tool) => [tool.name, tool]));
  const rows: ExplicitToolRule[] = [];
  const seen = new Set<string>();

  for (const tool of catalogue) {
    if (!named.has(tool.name)) {
      continue;
    }
    seen.add(tool.name);
    rows.push({
      name: tool.name,
      description: tool.description ?? "",
      effect: resolveEffectivePermission(policy, tool.name),
      advertised: true,
    });
  }

  for (const name of firstSeenOrder(policy)) {
    if (seen.has(name)) {
      continue;
    }
    const fromCatalogue = advertised.get(name);
    rows.push({
      name,
      description: fromCatalogue?.description ?? STALE_DESCRIPTION,
      effect: resolveEffectivePermission(policy, name),
      advertised: Boolean(fromCatalogue),
    });
  }

  return rows;
}

export function listUnruledTools(
  policy: GroupServerPolicyView,
  catalogue: readonly CatalogueTool[],
): CatalogueTool[] {
  const named = namedTools(policy);
  return catalogue.filter((tool) => !named.has(tool.name));
}

export function filterCatalogueTools(
  tools: readonly CatalogueTool[],
  query: string,
): CatalogueTool[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...tools];
  }
  return tools.filter((tool) => {
    const haystack = `${tool.name} ${tool.description ?? ""}`.toLowerCase();
    return haystack.includes(q);
  });
}
