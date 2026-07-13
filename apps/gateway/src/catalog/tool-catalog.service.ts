import { PolicyDecision, type ServerToolView } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import { CredentialResolutionError, LinkingRequiredError } from "../credentials/types/credential-resolution.js";
import { getAgentPrincipal } from "../identity/agent-principal-context.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import { PolicyEnforcementService } from "../policy/policy-enforcement.service.js";
import type { AgentTool, CatalogTool } from "./types/catalog-tool.js";
import { namespaceTool } from "./utils/namespacing.js";

@injectable()
export class ToolCatalogService {
  private catalog: CatalogTool[] = [];
  private serverTools = new Map<string, ServerToolView[]>();

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
    return this.catalog.find((entry) => entry.namespacedName === namespacedName);
  }

  /**
   * Fan out `tools/list` to all connected backends, namespace results, and
   * refresh the in-memory catalog.
   */
  async refresh(): Promise<CatalogTool[]> {
    const catalog: CatalogTool[] = [];
    const serverTools = new Map<string, ServerToolView[]>();
    const connected = this.connectionManager
      .list()
      .filter((connection) => connection.state === "connected");

    await Promise.all(
      connected.map(async (connection) => {
        if (!connection.client) {
          return;
        }

        try {
          await this.credentialResolver.resolve(connection.config);
          const result = await connection.client.listTools();
          const principal = getAgentPrincipal();
          const backendToolNames = result.tools.map((tool) => tool.name);

          this.policyEnforcement.warnUnknownPolicyTools(
            connection.config,
            backendToolNames,
          );

          const toolsForServer: ServerToolView[] = [];

          for (const tool of result.tools) {
            const allowed =
              this.policyEnforcement.evaluate(
                principal,
                connection.config.name,
                tool.name,
              ) !== PolicyDecision.Denied;

            toolsForServer.push({
              name: tool.name,
              description: tool.description,
              allowed,
            });

            if (!allowed) {
              continue;
            }

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

          serverTools.set(connection.config.name, toolsForServer);
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

    this.catalog = catalog;
    this.serverTools = serverTools;
    return catalog;
  }

  /** Agent-facing tool list with namespaced `name` fields. */
  async listToolsForAgent(): Promise<AgentTool[]> {
    const catalog = await this.refresh();
    return catalog.map((entry) => entry.tool);
  }
}
