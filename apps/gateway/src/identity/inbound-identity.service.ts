import type { AgentIdentityResolver, AgentPrincipal } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { IdentityResolutionError } from "./types/identity-resolution-error.js";
import { AGENT_IDENTITY_RESOLVER } from "./types/tokens.js";
import { extractBearerCredential } from "./utils/extract-bearer-credential.js";

@injectable()
export class InboundIdentityService {
  constructor(
    @inject(AGENT_IDENTITY_RESOLVER)
    private readonly identityResolver: AgentIdentityResolver,
  ) {}

  async resolveFromAuthorizationHeader(
    authorization: string | string[] | undefined,
  ): Promise<AgentPrincipal> {
    try {
      const credential = extractBearerCredential(authorization);
      return await this.identityResolver.resolve(credential);
    } catch (error) {
      if (error instanceof IdentityResolutionError) {
        throw error;
      }
      throw new IdentityResolutionError("Identity resolution failed", {
        cause: error,
      });
    }
  }
}
