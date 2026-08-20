/**
 * Config for {@link StaticSubjectValidator}: shared-secret credentials that
 * all resolve to the platform bearer. The secrets never appear in the
 * `bearers` table.
 */
export interface StaticSubjectConfig {
  /** Opaque subject tokens Fuda will accept. */
  tokens: ReadonlySet<string>;
}
