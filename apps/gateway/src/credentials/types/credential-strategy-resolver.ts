import type { ServerConfig } from "@keidai/shared";
import type { ResolvedCredentials } from "./credential-resolution.js";

export interface CredentialStrategyResolver {
  resolve(
    server: ServerConfig,
  ): ResolvedCredentials | Promise<ResolvedCredentials>;
}
