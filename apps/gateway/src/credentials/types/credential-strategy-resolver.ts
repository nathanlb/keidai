import type { ServerConfig } from "@torii/shared";
import type { ResolvedCredentials } from "./credential-resolution.js";

export interface CredentialStrategyResolver {
  resolve(
    server: ServerConfig,
  ): ResolvedCredentials | Promise<ResolvedCredentials>;
}
