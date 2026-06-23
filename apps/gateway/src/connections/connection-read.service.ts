import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "./connection-manager.service.js";
import type {
  ConnectionStateChangedEvent,
  ConnectionsResponse,
} from "./types/connections.dto.js";
import { projectPublicConnection } from "./utils/project-connections-api.js";

/** Read-only projections of live backend connection state for UI consumption. */
@injectable()
export class ConnectionReadService {
  constructor(
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
  ) {}

  listConnections(): ConnectionsResponse {
    return {
      connections: this.connectionManager
        .list()
        .map((connection) => projectPublicConnection(connection)),
    };
  }

  subscribe(listener: (event: ConnectionStateChangedEvent) => void): () => void {
    return this.connectionManager.subscribe((connection) => {
      listener({
        type: "connection_state_changed",
        connection: projectPublicConnection(connection),
      });
    });
  }
}
