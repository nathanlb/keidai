import type { ManagementAgent } from "../../lib/api/agents.js";

/** Case-insensitive substring match against name, slug, and groups. */
export function filterAgents(
  agents: readonly ManagementAgent[],
  query: string,
): ManagementAgent[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...agents];
  }

  return agents.filter((agent) => {
    const haystack =
      `${agent.name} ${agent.slug} ${agent.groups.join(" ")}`.toLowerCase();
    return haystack.includes(q);
  });
}
