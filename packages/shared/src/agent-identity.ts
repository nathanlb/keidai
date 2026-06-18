/** Normalized agent identity — internal ids only; never the credential's native subject. */
export interface AgentPrincipal {
  /** Internal agent id — never the credential's native subject. */
  agentId: string;
  /** The single owner this agent acts as (strict ownership). */
  ownerId: string;
  /** Group memberships for RBAC. */
  groups: string[];
}

/**
 * Maps a verifiable agent credential to a normalized {@link AgentPrincipal}.
 *
 * The mapping from native subject to internal `agentId` lives inside the
 * resolver implementation. Nothing downstream may branch on the credential's
 * native form — policy, catalog, and trace speak internal ids only. This is
 * what makes the credential mechanism swappable (e.g. K8s SA token in v0,
 * SPIFFE/SVID later) without touching Torii's core.
 */
export interface AgentIdentityResolver {
  resolve(credential: string): Promise<AgentPrincipal>;
}
