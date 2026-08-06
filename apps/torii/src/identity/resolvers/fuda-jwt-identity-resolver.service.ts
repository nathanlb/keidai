import type { AgentIdentityResolver, AgentPrincipal } from "@keidai/shared";
import * as jose from "jose";
import { inject, injectable } from "tsyringe";
import type { FudaJwtConfig } from "../types/fuda-jwt-config.js";
import { IdentityResolutionError } from "../types/identity-resolution-error.js";
import { FUDA_JWT_CONFIG, JWT_VERIFY_KEY } from "../types/tokens.js";
import {
  createResilientRemoteJWKSet,
  type JwtVerifyKey,
} from "../utils/create-resilient-remote-jwks.js";

/** Audience Fuda stamps on agent identity tokens (`TOKEN_EXCHANGE_AUDIENCE`). */
export const FUDA_JWT_AUDIENCE = "torii";

export type { JwtVerifyKey };

@injectable()
export class FudaJwtIdentityResolver implements AgentIdentityResolver {
  private readonly verifyKey: JwtVerifyKey;

  constructor(
    @inject(FUDA_JWT_CONFIG)
    private readonly config: FudaJwtConfig,
    @inject(JWT_VERIFY_KEY, { isOptional: true })
    verifyKey?: JwtVerifyKey,
  ) {
    this.verifyKey =
      verifyKey ?? createResilientRemoteJWKSet(new URL(this.config.jwksUri));
  }

  async resolve(credential: string): Promise<AgentPrincipal> {
    try {
      const { payload } = await jose.jwtVerify(credential, this.verifyKey, {
        issuer: this.config.issuer,
        audience: FUDA_JWT_AUDIENCE,
      });

      return this.principalFromClaims(payload);
    } catch (error) {
      throw this.toResolutionError(error);
    }
  }

  private principalFromClaims(payload: jose.JWTPayload): AgentPrincipal {
    const agentId = payload.agent_id;
    const ownerId = payload.owner_id;
    const bearerId = payload.bearer_id;
    const groups = payload.groups;

    if (typeof agentId !== "string" || agentId.length === 0) {
      throw new IdentityResolutionError(
        "Token agent_id claim is missing or invalid",
      );
    }
    if (typeof ownerId !== "string" || ownerId.length === 0) {
      throw new IdentityResolutionError(
        "Token owner_id claim is missing or invalid",
      );
    }
    if (typeof bearerId !== "string" || bearerId.length === 0) {
      throw new IdentityResolutionError(
        "Token bearer_id claim is missing or invalid",
      );
    }
    if (
      !Array.isArray(groups) ||
      !groups.every((group) => typeof group === "string")
    ) {
      throw new IdentityResolutionError(
        "Token groups claim is missing or invalid",
      );
    }

    return Object.freeze({
      agentId,
      ownerId,
      groups: [...groups],
      bearerId,
    });
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
