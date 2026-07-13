import type { ServerConfig } from "@keidai/shared";
import { injectable } from "tsyringe";
import type { ResolvedCredentials } from "../types/credential-resolution.js";
import type { CredentialStrategyResolver } from "../types/credential-strategy-resolver.js";

@injectable()
export class NoneCredentialResolver implements CredentialStrategyResolver {
  resolve(server: ServerConfig): ResolvedCredentials {
    if (server.credential.strategy !== "none") {
      throw new Error(
        `NoneCredentialResolver cannot handle strategy "${server.credential.strategy}"`,
      );
    }

    return {
      headers: {},
      credentialRef: "none",
    };
  }
}
