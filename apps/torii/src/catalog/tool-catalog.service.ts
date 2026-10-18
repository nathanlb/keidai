import { PolicyDecision, type ServerToolView } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import {
  CredentialResolutionError,
  LinkingRequiredError,
} from "../credentials/types/credential-resolution.js";
import { getAgentPrincipal } from "../identity/agent-principal-context.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import { PolicyEnforcementService } from "../policy/policy-enforcement.service.js";
import {
  AGENT_TOOL_LIST_CACHE_SCOPE,
  AGENT_TOOL_LIST_TTL_MS,
  type AgentToolsListResult,
  type CatalogTool,
} from "./types/catalog-tool.js";
import { namespaceTool } from "./utils/namespacing.js";

type RawMcpTool = CatalogTool["tool"];

@injectable()
export class ToolCatalogService {
  private catalog: CatalogTool[] = [];
  private serverTools = new Map<string, ServerToolView[]>();
  private readonly discoveredToolsByServer = new Map<string, RawMcpTool[]>();

  constructor(
    @inject(ConnectionManager)
    private readonly connectionManager: ConnectionManager,
    @inject(CredentialResolverService)
    private readonly credentialResolver: CredentialResolverService,
    @inject(PolicyEnforcementService)
    private readonly policyEnforcement: PolicyEnforcementService,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  /** Read-only view of the last refreshed catalog (used by policy post-boot). */
  getCatalog(): readonly CatalogTool[] {
    return this.catalog;
  }

  /** Backend tools for a server from the last catalog refresh (includes blocked tools). */
  getServerTools(serverName: string): readonly ServerToolView[] {
    return this.serverTools.get(serverName) ?? [];
  }

  findTool(namespacedName: string): CatalogTool | undefined {
    return this.catalog.find(
      (entry) => entry.namespacedName === namespacedName,
    );
  }

  /**
   * Fan out `tools/list` to all connected backends, namespace results, and
   * refresh the in-memory catalog.
   */
  async refresh(): Promise<CatalogTool[]> {
    const catalog: CatalogTool[] = [];
    const serverTools = new Map<string, ServerToolView[]>();
    const allConnections = this.connectionManager.list();
    const activeServers = new Set(
      allConnections.map((connection) => connection.config.name),
    );
    for (const cachedServer of this.discoveredToolsByServer.keys()) {
      if (!activeServers.has(cachedServer)) {
        this.discoveredToolsByServer.delete(cachedServer);
      }
    }

    const connected = allConnections.filter(
      (connection) => connection.state === "connected",
    );
    const refreshedServers = new Set<string>();

    await Promise.all(
      connected.map(async (connection) => {
        if (!connection.client) {
          return;
        }

        try {
          await this.credentialResolver.resolve(connection.config);
          const result = await connection.client.listTools();
          this.discoveredToolsByServer.set(
            connection.config.name,
            result.tools,
          );
          refreshedServers.add(connection.config.name);
          this.populateServerCatalog(
            connection.config.name,
            result.tools,
            catalog,
            serverTools,
            true,
          );
        } catch (error) {
          if (error instanceof LinkingRequiredError) {
            this.logger.warn("catalog.linking_required", {
              server: connection.config.name,
              provider: error.payload.provider,
            });
            return;
          }

          const err = error instanceof Error ? error : new Error(String(error));
          const message =
            error instanceof CredentialResolutionError
              ? err.message
              : `Failed to list tools from backend "${connection.config.name}": ${err.message}`;
          this.logger.error("catalog.list_failed", {
            server: connection.config.name,
            error: message,
          });
        }
      }),
    );

    for (const connection of allConnections) {
      const serverName = connection.config.name;
      if (
        refreshedServers.has(serverName) ||
        connection.config.credential.strategy !== "user_oauth"
      ) {
        continue;
      }
      const cachedTools = this.discoveredToolsByServer.get(serverName);
      if (!cachedTools) {
        continue;
      }
      this.populateServerCatalog(
        serverName,
        cachedTools,
        catalog,
        serverTools,
        false,
      );
    }

    catalog.sort((left, right) =>
      left.namespacedName.localeCompare(right.namespacedName),
    );
    this.catalog = catalog;
    this.serverTools = serverTools;
    return catalog;
  }

  private populateServerCatalog(
    serverName: string,
    tools: readonly RawMcpTool[],
    catalog: CatalogTool[],
    serverTools: Map<string, ServerToolView[]>,
    warnUnknown: boolean,
  ): void {
    if (warnUnknown) {
      const backendToolNames = tools.map((tool) => tool.name);
      this.policyEnforcement.warnUnknownPolicyTools(
        serverName,
        backendToolNames,
      );
    }

    const toolsForServer: ServerToolView[] = [];

    for (const tool of tools) {
      const configured = this.policyEnforcement.isConfiguredGrant(
        serverName,
        tool.name,
      );

      toolsForServer.push({
        name: tool.name,
        description: tool.description,
        // Grant surface across all groups. Connections UI lists every
        // backend tool; agent tools/list still filters by principal.
        allowed: configured,
      });

      if (!configured) {
        continue;
      }

      const namespacedName = namespaceTool(serverName, tool.name);
      catalog.push({
        server: serverName,
        bareName: tool.name,
        namespacedName,
        tool: { ...tool, name: namespacedName },
      });
    }

    serverTools.set(serverName, toolsForServer);
  }

  /**
   * Agent-facing `tools/list` with namespaced `name` fields, stable order,
   * and cache hints. `cacheScope` is `private` because the list is filtered
   * per agent by group policy.
   */
  async listToolsForAgent(): Promise<AgentToolsListResult> {
    // user_oauth MCP servers often require Authorization on initialize.
    // Boot connect has no agent principal, so reconnect now that one is set.
    await this.connectionManager.ensureUserOAuthConnected();
    const catalog = await this.refresh();
    const principal = getAgentPrincipal();
    const tools = catalog
      .filter(
        (entry) =>
          this.policyEnforcement.evaluate(
            principal,
            entry.server,
            entry.bareName,
          ).decision !== PolicyDecision.Denied,
      )
      .map((entry) => entry.tool);
    return {
      tools,
      ttlMs: AGENT_TOOL_LIST_TTL_MS,
      cacheScope: AGENT_TOOL_LIST_CACHE_SCOPE,
    };
  }
}
