import type { StaticSubjectConfig } from "../types/static-subject-config.js";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import type { SubjectTokenValidator } from "../types/subject-token-validator.js";

/**
 * Local-dev / pre-cluster subject validator: config-declared shared secrets
 * map to `bearer_id`. Attestation is only as strong as the secret.
 *
 * Lookup is not constant-time (`Map.get`). Acceptable for local/pre-cluster
 * shared secrets; do not reuse this path for production credential stores.
 */
export class StaticSubjectValidator implements SubjectTokenValidator {
  private readonly mappings: ReadonlyMap<string, string>;

  constructor(config: StaticSubjectConfig) {
    this.mappings = config.mappings;
  }

  async validate(subjectToken: string): Promise<string> {
    const token = subjectToken.trim();
    if (token.length === 0) {
      throw new SubjectTokenValidationError("Invalid subject token");
    }

    const bearerId = this.mappings.get(token);
    if (bearerId === undefined) {
      throw new SubjectTokenValidationError("Invalid subject token");
    }

    return bearerId;
  }
}
