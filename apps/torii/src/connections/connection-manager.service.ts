import type { ServerConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
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

  /**
   * Diff the live connection map against the current connector registry.
   * Adds new backends, closes removed ones, and reconnects changed URLs.
   */
  async reconcile(): Promise<void> {
    const desired = this.configService.get().servers;
    const desiredNames = new Set(desired.map((server) => server.name));

    for (const existing of this.list()) {
      if (desiredNames.has(existing.config.name)) {
        continue;
      }
      if (existing.client) {
        await existing.client.close();
      }
      this.connections.delete(existing.config.name);
    }

    for (const server of desired) {
      const current = this.connections.get(server.name);
      if (!current) {
        this.setConnection(server.name, {
          config: server,
          state: "connecting",
          client: null,
        });
        await this.connectServer(server);
        continue;
      }

      const urlChanged = current.config.transport.url !== server.transport.url;
      const authChanged =
        JSON.stringify(current.config.credential) !==
        JSON.stringify(server.credential);
      if (urlChanged || authChanged) {
        await this.reconnect(server.name);
      }
    }
  }

  /**
   * Ensures a backend has a live MCP client. Used when an agent principal is
   * available so user_oauth handshakes can attach Authorization (boot connect
   * often fails open without a principal against auth-required MCP servers).
   */
  async ensureConnected(name: string): Promise<BackendConnection> {
    const existing = this.connections.get(name);
    if (existing?.state === "connected" && existing.client) {
      return existing;
    }

    await this.reconnect(name);
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Unknown server: ${name}`);
    }
    return connection;
  }

  /**
   * Reconnects every user_oauth backend that is not currently connected.
   * No-op for backends that are already up.
   */
  async ensureUserOAuthConnected(): Promise<void> {
    const targets = this.list().filter(
      (connection) =>
        connection.config.credential.strategy === "user_oauth" &&
        !(connection.state === "connected" && connection.client),
    );
    await Promise.all(
      targets.map((connection) => this.ensureConnected(connection.config.name)),
    );
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
  }
}
