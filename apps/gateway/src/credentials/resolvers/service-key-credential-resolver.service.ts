import type { ServerConfig } from "@torii/shared";
import { injectable } from "tsyringe";
import type { ResolvedCredentials } from "../types/credential-resolution.js";
import type { CredentialStrategyResolver } from "../types/credential-strategy-resolver.js";

@injectable()
export class ServiceKeyCredentialResolver implements CredentialStrategyResolver {
  resolve(server: ServerConfig): ResolvedCredentials {
    if (server.credential.strategy !== "service_key") {
      throw new Error(
        `ServiceKeyCredentialResolver cannot handle strategy "${server.credential.strategy}"`,
      );
    }

    const { key, inject } = server.credential;
    const headers = inject?.header
      ? { [inject.header]: key }
      : { Authorization: `Bearer ${key}` };

    return {
      headers,
      credentialRef: `service_key:${server.name}`,
    };
  }
}
