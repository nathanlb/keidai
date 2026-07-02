import type { ConnectionStatus } from "@keidai/shared";
import type { BackendConnection } from "../types/backend-connection.js";

function projectConnectionErrorMessage(error: Error): string {
  if (error.message === "AgentPrincipal not set on request context") {
    return "Could not resolve OAuth credentials for gateway connections";
  }

  return error.message;
}

export function projectPublicConnection(
  connection: BackendConnection,
): ConnectionStatus {
  return {
    name: connection.config.name,
    state: connection.state,
    ...(connection.error
      ? { error: projectConnectionErrorMessage(connection.error) }
      : {}),
  };
}
