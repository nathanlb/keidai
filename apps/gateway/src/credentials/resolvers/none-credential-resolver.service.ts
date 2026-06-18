import type { ServerConfig } from "@torii/shared";
import { injectable } from "tsyringe";
import type { ResolvedCredentials } from "../types/credential-resolution.js";

@injectable()
export class NoneCredentialResolver {
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
