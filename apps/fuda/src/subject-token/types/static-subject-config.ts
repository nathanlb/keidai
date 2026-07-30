/**
 * Config for {@link StaticSubjectValidator}: shared-secret credential →
 * `bearer_id`. The credential strings never appear in the `bearers` table.
 */
export interface StaticSubjectConfig {
  /** Opaque subject token → internal bearer_id. */
  mappings: ReadonlyMap<string, string>;
}
