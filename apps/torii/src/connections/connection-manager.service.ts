import type { ServerConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { runWithAgentPrincipal } from "../identity/agent-principal-context.js";
import { resolveBootAgentPrincipal } from "../identity/stub-agent-principal.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import { DefaultMcpClientConnector } from "./mcp-client-connector.service.js";
import type { BackendConnection } from "./types/backend-connection.js";
import type { McpClientConnector } from "./types/mcp-client-connector.js";

export type ConnectionStateListener = (connection: BackendConnection) => void;

@injectable()
export class ConnectionManager {
  private readonly connections = new Map<string, BackendConnection>();
  private readonly stateListeners = new Set<ConnectionStateListener>();

  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(DefaultMcpClientConnector)
    private readonly connector: McpClientConnector,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  async connectAll(): Promise<void> {
    const servers = this.configService.get().servers;

    for (const server of servers) {
      this.setConnection(server.name, {
        config: server,
        state: "connecting",
        client: null,
      });
    }

    await Promise.all(servers.map((server) => this.connectServer(server)));
  }

  async reconnect(name: string): Promise<void> {
    const server = this.configService.getServer(name);
    if (!server) {
      throw new Error(`Unknown server: ${name}`);
    }

    const existing = this.connections.get(name);
    if (existing?.client) {
      await existing.client.close();
    }

    this.setConnection(name, {
      config: server,
      state: "connecting",
      client: null,
    });

    await this.connectServer(server);
  }

  async reconnectAll(): Promise<void> {
    const servers = this.configService.get().servers;
    await Promise.all(servers.map((server) => this.reconnect(server.name)));
  }

  get(name: string): BackendConnection | undefined {
    return this.connections.get(name);
  }

  list(): BackendConnection[] {
    return [...this.connections.values()];
  }

  subscribe(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /**
   * Re-emit current connection state so subscribers recompute projections
   * (e.g. toolCount after a catalog refresh).
   */
  rebroadcast(name?: string): void {
    if (name !== undefined) {
      const connection = this.connections.get(name);
      if (connection) {
        this.notifyStateChange(connection);
      }
      return;
    }

    for (const connection of this.connections.values()) {
      this.notifyStateChange(connection);
    }
  }

  private setConnection(name: string, connection: BackendConnection): void {
    this.connections.set(name, connection);
    this.notifyStateChange(connection);
  }

  private notifyStateChange(connection: BackendConnection): void {
    for (const listener of this.stateListeners) {
      listener(connection);
    }
  }

  private async connectServer(server: ServerConfig): Promise<void> {
    const principal = resolveBootAgentPrincipal(this.configService.get());

    await runWithAgentPrincipal(principal, async () => {
      try {
        const client = await this.connector.connect(server);
        this.setConnection(server.name, {
          config: server,
          state: "connected",
          client,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error("connection.failed", {
          server: server.name,
          url: server.transport.url,
          error: err.message,
        });
        this.setConnection(server.name, {
          config: server,
          state: "failed",
          client: null,
          error: err,
        });
      }
    });
  }
}
