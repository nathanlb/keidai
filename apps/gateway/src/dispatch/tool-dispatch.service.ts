import {
  CallToolResultSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "../backends/connection-manager.service.js";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import { CredentialResolutionError } from "../credentials/types/credential-resolution.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "./types/tool-dispatch.js";

@injectable()
export class ToolDispatchService {
  constructor(
    @inject(ToolCatalogService)
    private readonly toolCatalog: ToolCatalogService,
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
    @inject(CredentialResolverService)
    private readonly credentialResolver: CredentialResolverService,
  ) {}

  async callTool(
    namespacedName: string,
    args?: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const entry = this.toolCatalog.findTool(namespacedName);
    if (!entry) {
      throw new ToolNotFoundError(namespacedName);
    }

    const connection = this.connectionManager.get(entry.server);
    if (!connection || connection.state === "failed") {
      const reason =
        connection?.state === "failed"
          ? (connection.error?.message ?? "connection failed")
          : "not configured";
      throw new BackendUnavailableError(entry.server, reason);
    }

    if (!connection.client) {
      throw new BackendUnavailableError(entry.server, "not connected");
    }

    try {
      await this.credentialResolver.resolve(connection.config);
    } catch (error) {
      if (error instanceof CredentialResolutionError) {
        console.error(error.message);
        throw error;
      }
      throw error;
    }

    return (await connection.client.callTool(
      {
        name: entry.bareName,
        arguments: args,
      },
      CallToolResultSchema,
    )) as CallToolResult;
  }
}
