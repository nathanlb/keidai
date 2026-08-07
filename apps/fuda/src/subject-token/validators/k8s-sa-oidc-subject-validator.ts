import * as jose from "jose";
import type { K8sSaOidcSubjectConfig } from "../types/k8s-sa-oidc-subject-config.js";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import type { SubjectTokenValidator } from "../types/subject-token-validator.js";
import { parseK8sSaSubject } from "../utils/parse-k8s-sa-subject.js";
import { registryKey } from "../utils/registry-key.js";

export type JwtVerifyKey = jose.JWTVerifyGetKey;

/**
 * Validates a Kubernetes projected service-account OIDC token and maps the
 * SA subject to an internal `bearer_id` via validator-private config.
 *
 * Optional `verifyKey` injects a JWKS/key lookup for unit tests (same seam
 * as Torii's former `K8sSaOidcIdentityResolver`). See `deploy/k8s/` for
 * cluster wiring (projected SA tokens + kind).
 */
export class K8sSaOidcSubjectValidator implements SubjectTokenValidator {
  private readonly verifyKey: JwtVerifyKey;
  private readonly config: K8sSaOidcSubjectConfig;

  constructor(config: K8sSaOidcSubjectConfig, verifyKey?: JwtVerifyKey) {
    this.config = config;
    this.verifyKey =
      verifyKey ?? jose.createRemoteJWKSet(new URL(config.jwksUri));
  }

  async validate(subjectToken: string): Promise<string> {
    try {
      const { payload } = await jose.jwtVerify(subjectToken, this.verifyKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      if (typeof payload.sub !== "string") {
        throw new SubjectTokenValidationError(
          "Token subject is missing or invalid",
        );
      }

      const validatedSubject = parseK8sSaSubject(payload.sub);
      const bearerId = this.config.mappings.get(registryKey(validatedSubject));
      if (bearerId === undefined) {
        throw new SubjectTokenValidationError("Invalid subject token");
      }

      return bearerId;
    } catch (error) {
      throw this.toValidationError(error);
    }
  }

  private toValidationError(error: unknown): SubjectTokenValidationError {
    if (error instanceof SubjectTokenValidationError) {
      return error;
    }
    if (error instanceof jose.errors.JWTExpired) {
      return new SubjectTokenValidationError("Token expired", { cause: error });
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      return new SubjectTokenValidationError(error.message, { cause: error });
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      return new SubjectTokenValidationError("Invalid token signature", {
        cause: error,
      });
    }
    if (error instanceof jose.errors.JOSEError) {
      return new SubjectTokenValidationError("Token validation failed", {
        cause: error,
      });
    }
    return new SubjectTokenValidationError("Token validation failed", {
      cause: error,
    });
  }
}
