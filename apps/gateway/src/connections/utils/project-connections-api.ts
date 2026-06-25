import type { ConnectionStatus } from "@keidai/shared";
import type { BackendConnection } from "../types/backend-connection.js";

export function projectPublicConnection(
  connection: BackendConnection,
): ConnectionStatus {
  return {
    name: connection.config.name,
    state: connection.state,
    ...(connection.error ? { error: connection.error.message } : {}),
  };
}
