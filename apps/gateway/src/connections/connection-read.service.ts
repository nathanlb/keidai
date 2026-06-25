import {
  CONNECTION_SSE_EVENT,
  type ConnectionSseEvent,
  type ConnectionsResponse,
} from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "./connection-manager.service.js";
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

  subscribe(listener: (event: ConnectionSseEvent) => void): () => void {
    return this.connectionManager.subscribe((connection) => {
      listener({
        type: CONNECTION_SSE_EVENT.stateChanged,
        connection: projectPublicConnection(connection),
      });
    });
  }
}
