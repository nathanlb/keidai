import {
  CONNECTION_SSE_EVENT,
  type ConnectionSseEvent,
  type ConnectionsResponse,
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

  listConnections(): ConnectionsResponse {
    return {
      connections: this.connectionManager
        .list()
        .map((connection) => this.projectConnection(connection)),
    };
  }

  subscribe(listener: (event: ConnectionSseEvent) => void): () => void {
    return this.connectionManager.subscribe((connection) => {
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

    const toolCount = this.toolCatalog
      .getCatalog()
      .filter((entry) => entry.server === connection.config.name).length;

    return {
      ...projected,
      toolCount,
    };
  }
}
