import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import type { StaticSubjectConfig } from "../types/static-subject-config.js";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import type { SubjectTokenValidator } from "../types/subject-token-validator.js";

/**
 * Local-dev / pre-cluster subject validator: config-declared shared secrets
 * all resolve to {@link PLATFORM_BEARER_ID}. Attestation is only as strong
 * as the secret.
 *
 * Lookup is not constant-time (`Set.has`). Acceptable for local/pre-cluster
 * shared secrets; do not reuse this path for production credential stores.
 */
export class StaticSubjectValidator implements SubjectTokenValidator {
  private readonly tokens: ReadonlySet<string>;

  constructor(config: StaticSubjectConfig) {
    this.tokens = config.tokens;
  }

  async validate(subjectToken: string): Promise<string> {
    const token = subjectToken.trim();
    if (token.length === 0) {
      throw new SubjectTokenValidationError("Invalid subject token");
    }

    if (!this.tokens.has(token)) {
      throw new SubjectTokenValidationError("Invalid subject token");
    }

    return PLATFORM_BEARER_ID;
  }
}
