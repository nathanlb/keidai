/**
 * Validates a subject token (platform credential attesting the calling process)
 * and returns the internal `bearer_id`.
 *
 * The mapping from a native credential subject to `bearer_id` is
 * validator-private. Nothing outside the validator branches on the
 * credential's native form — the token endpoint, grant check, and schema
 * see `bearer_id` only. That is what makes adding a second validator
 * (k8s SA OIDC, SPIFFE later) an addition rather than a refactor.
 *
 * Implementations must not persist or log the native credential subject
 * as an identity.
 */
export interface SubjectTokenValidator {
  validate(subjectToken: string): Promise<string>;
}

/** tsyringe injection token for {@link SubjectTokenValidator}. */
export const SUBJECT_TOKEN_VALIDATOR = Symbol("SubjectTokenValidator");
