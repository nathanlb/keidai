/**
 * Resolve a Fuda opaque agent id to its human-readable slug when the
 * management catalog is available. Traces store the opaque id; the UI
 * renders the slug when known.
 */
export function resolveAgentSlug(
  agentId: string | undefined,
  slugById: ReadonlyMap<string, string>,
): string | undefined {
  if (!agentId) {
    return undefined;
  }
  return slugById.get(agentId);
}

/** Prefer slug for display; fall back to the opaque id. */
export function formatAgentPrincipalLabel(
  agentId: string | undefined,
  slugById: ReadonlyMap<string, string>,
): string | undefined {
  if (!agentId) {
    return undefined;
  }
  return resolveAgentSlug(agentId, slugById) ?? agentId;
}
