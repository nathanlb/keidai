import type { BackendConnection } from "../types/backend-connection.js";
import type { PublicConnectionStatus } from "../types/connections.dto.js";

export function projectPublicConnection(
  connection: BackendConnection,
): PublicConnectionStatus {
  return {
    name: connection.config.name,
    state: connection.state,
    ...(connection.error ? { error: connection.error.message } : {}),
  };
}
