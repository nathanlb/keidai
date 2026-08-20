import * as jose from "jose";
import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import type { K8sSaOidcSubjectConfig } from "../types/k8s-sa-oidc-subject-config.js";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import type { SubjectTokenValidator } from "../types/subject-token-validator.js";
import { createClusterRemoteJwkSet } from "../utils/create-cluster-remote-jwk-set.js";
import { parseK8sSaSubject } from "../utils/parse-k8s-sa-subject.js";
import { registryKey } from "../utils/registry-key.js";

export type JwtVerifyKey = jose.JWTVerifyGetKey;

/**
 * Validates a Kubernetes projected service-account OIDC token and, if the
 * SA is in the allow-list, returns {@link PLATFORM_BEARER_ID}.
 *
 * Optional `verifyKey` injects a JWKS/key lookup for unit tests. Production
 * fetches JWKS with the in-cluster SA token — many clusters reject anonymous
 * JWKS access (401). See `deploy/k8s/` for cluster wiring.
 */
export class K8sSaOidcSubjectValidator implements SubjectTokenValidator {
  private readonly verifyKey: JwtVerifyKey;
  private readonly config: K8sSaOidcSubjectConfig;

  constructor(config: K8sSaOidcSubjectConfig, verifyKey?: JwtVerifyKey) {
    this.config = config;
    this.verifyKey =
      verifyKey ??
      createClusterRemoteJwkSet(
        config.jwksUri,
        config.jwksBearerTokenFile,
      );
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
      if (!this.config.subjects.has(registryKey(validatedSubject))) {
        throw new SubjectTokenValidationError("Invalid subject token");
      }

      return PLATFORM_BEARER_ID;
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
