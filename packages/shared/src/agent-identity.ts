/** Normalized agent identity — internal ids only; never the credential's native subject. */
export interface AgentPrincipal {
  /** Internal agent id — never the credential's native subject. */
  agentId: string;
  /** The single owner this agent acts as (strict ownership). */
  ownerId: string;
  /** Group memberships for RBAC. */
  groups: string[];
  /** Attested process that vouched for this agent (Fuda `bearer_id` claim). */
  bearerId: string;
}

/**
 * Maps a verifiable agent credential to a normalized {@link AgentPrincipal}.
 *
 * For Fuda-minted JWTs the principal is built from token claims only — no
 * registry lookup after validation. Nothing downstream may branch on the
 * credential's native form — policy, catalog, and trace speak internal ids
 * only.
 */
export interface AgentIdentityResolver {
  resolve(credential: string): Promise<AgentPrincipal>;
}
