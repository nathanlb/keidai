import type { AgentIdentityResolver, AgentPrincipal } from "@torii/shared";
import * as jose from "jose";
import { inject, injectable } from "tsyringe";
import type { AgentRegistry } from "../types/agent-registry.js";
import { IdentityResolutionError } from "../types/identity-resolution-error.js";
import type { K8sSaOidcConfig } from "../types/k8s-sa-oidc-config.js";
import { AGENT_REGISTRY, K8S_SA_OIDC_CONFIG } from "../types/tokens.js";
import { parseK8sSaSubject } from "../utils/parse-k8s-sa-subject.js";

export type JwtVerifyKey = jose.JWTVerifyGetKey;

@injectable()
export class K8sSaOidcIdentityResolver implements AgentIdentityResolver {
  private readonly verifyKey: JwtVerifyKey;

  constructor(
    @inject(AGENT_REGISTRY)
    private readonly agentRegistry: AgentRegistry,
    @inject(K8S_SA_OIDC_CONFIG)
    private readonly config: K8sSaOidcConfig,
    verifyKey?: JwtVerifyKey,
  ) {
    this.verifyKey =
      verifyKey ?? jose.createRemoteJWKSet(new URL(this.config.jwksUri));
  }

  async resolve(credential: string): Promise<AgentPrincipal> {
    try {
      const { payload } = await jose.jwtVerify(credential, this.verifyKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      if (typeof payload.sub !== "string") {
        throw new IdentityResolutionError("Token subject is missing or invalid");
      }

      const validatedSubject = parseK8sSaSubject(payload.sub);
      return this.agentRegistry.lookup(validatedSubject);
    } catch (error) {
      throw this.toResolutionError(error);
    }
  }

  private toResolutionError(error: unknown): IdentityResolutionError {
    if (error instanceof IdentityResolutionError) {
      return error;
    }
    if (error instanceof jose.errors.JWTExpired) {
      return new IdentityResolutionError("Token expired", { cause: error });
    }
    if (error instanceof jose.errors.JWTClaimValidationFailed) {
      return new IdentityResolutionError(error.message, { cause: error });
    }
    if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
      return new IdentityResolutionError("Invalid token signature", {
        cause: error,
      });
    }
    if (error instanceof jose.errors.JOSEError) {
      return new IdentityResolutionError("Token validation failed", {
        cause: error,
      });
    }
    return new IdentityResolutionError("Token validation failed", {
      cause: error,
    });
  }
}
