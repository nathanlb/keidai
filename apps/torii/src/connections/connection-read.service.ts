import {
  CONNECTION_SSE_EVENT,
  type ConnectionSseEvent,
  type ConnectionsResponse,
  type ServerToolsResponse,
} from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { ConnectionManager } from "./connection-manager.service.js";
import { projectPublicConnection } from "./utils/project-connections-api.js";

/** Read-only projections of live backend connection state for UI consumption. */
@injectable()
export class ConnectionReadService {
  constructor(
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
  ) {}

  listConnections(ownerId?: string): ConnectionsResponse {
    return {
      connections: this.connectionManager
        .list(ownerId)
        .map((connection) => this.projectConnection(connection)),
    };
  }

  getServerTools(serverName: string): ServerToolsResponse {
    return {
      tools: [...this.toolCatalog.getServerTools(serverName)],
    };
  }

  subscribe(
    listener: (event: ConnectionSseEvent) => void,
    ownerId?: string,
  ): () => void {
    return this.connectionManager.subscribe((connection, eventOwnerId) => {
      if (
        connection.config.credential.strategy === "user_oauth" &&
        ownerId !== undefined &&
        eventOwnerId !== ownerId
      ) {
        return;
      }
      listener({
        type: CONNECTION_SSE_EVENT.stateChanged,
        connection: this.projectConnection(connection),
      });
    });
  }

  private projectConnection(
    connection: Parameters<typeof projectPublicConnection>[0],
  ) {
    const projected = projectPublicConnection(connection);
    if (connection.state !== "connected") {
      return projected;
    }

    return {
      ...projected,
      toolCount: this.toolCatalog.getServerTools(connection.config.name).length,
    };
  }
}
