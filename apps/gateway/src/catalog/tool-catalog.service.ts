import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "../backends/connection-manager.service.js";
import type { AgentTool, CatalogTool } from "./types/catalog-tool.js";
import { namespaceTool } from "./utils/namespacing.js";

@injectable()
export class ToolCatalogService {
  private catalog: CatalogTool[] = [];

  constructor(
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
  ) {}

  /** Read-only view of the last refreshed catalog (used by policy post-boot). */
  getCatalog(): readonly CatalogTool[] {
    return this.catalog;
  }

  /**
   * Fan out `tools/list` to all connected backends, namespace results, and
   * refresh the in-memory catalog.
   */
  async refresh(): Promise<CatalogTool[]> {
    const catalog: CatalogTool[] = [];
    const connected = this.connectionManager
      .list()
      .filter((connection) => connection.state === "connected");

    await Promise.all(
      connected.map(async (connection) => {
        if (!connection.client) {
          return;
        }

        try {
          const result = await connection.client.listTools();
          for (const tool of result.tools) {
            const namespacedName = namespaceTool(
              connection.config.name,
              tool.name,
            );
            catalog.push({
              server: connection.config.name,
              bareName: tool.name,
              namespacedName,
              tool: { ...tool, name: namespacedName },
            });
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error(
            `Failed to list tools from backend "${connection.config.name}": ${err.message}`,
          );
        }
      }),
    );

    this.catalog = catalog;
    return catalog;
  }

  /** Agent-facing tool list with namespaced `name` fields. */
  async listToolsForAgent(): Promise<AgentTool[]> {
    const catalog = await this.refresh();
    return catalog.map((entry) => entry.tool);
  }
}
