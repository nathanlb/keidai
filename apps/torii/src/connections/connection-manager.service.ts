import type { ServerConfig } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import {
  tryGetAgentPrincipal,
  runWithAgentPrincipal,
} from "../identity/agent-principal-context.js";
import { operatorReconnectPrincipal } from "../identity/operator-reconnect-principal.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";
import type { Logger } from "@keidai/shared";
import { DefaultMcpClientConnector } from "./mcp-client-connector.service.js";
import type { BackendConnection } from "./types/backend-connection.js";
import type { McpClientConnector } from "./types/mcp-client-connector.js";

export type ConnectionStateListener = (
  connection: BackendConnection,
  ownerId?: string,
) => void;

@injectable()
export class ConnectionManager {
  private readonly connections = new Map<string, BackendConnection>();
  private readonly userConnections = new Map<
    string,
    Map<string, BackendConnection>
  >();
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
    const ambientOwnerId = tryGetAgentPrincipal()?.ownerId;

    for (const server of servers) {
      if (server.credential.strategy === "user_oauth" && ambientOwnerId) {
        this.ensureUnscopedBaseline(server);
        this.setUserConnection(server.name, ambientOwnerId, {
          config: server,
          state: "connecting",
          client: null,
        });
      } else {
        this.setConnection(server.name, {
          config: server,
          state: "connecting",
          client: null,
        });
      }
    }

    await Promise.all(
      servers.map((server) => this.connectServer(server, ambientOwnerId)),
    );
  }

  async reconnect(name: string, ownerId?: string): Promise<void> {
    const server = this.configService.getServer(name);
    if (!server) {
      throw new Error(`Unknown server: ${name}`);
    }

    const effectiveOwnerId =
      server.credential.strategy === "user_oauth"
        ? (ownerId ?? tryGetAgentPrincipal()?.ownerId)
        : undefined;

    if (server.credential.strategy === "user_oauth" && effectiveOwnerId) {
      this.ensureUnscopedBaseline(server);
      const existing = this.userConnections.get(name)?.get(effectiveOwnerId);
      if (existing?.client) {
        await existing.client.close();
      }

      this.setUserConnection(name, effectiveOwnerId, {
        config: server,
        state: "connecting",
        client: null,
      });

      await this.connectServer(server, effectiveOwnerId);
      return;
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

  async reconnectAll(ownerId?: string): Promise<void> {
    const servers = this.configService.get().servers;
    await Promise.all(
      servers.map((server) => this.reconnect(server.name, ownerId)),
    );
  }

  /**
   * Diff the live connection map against the current connector registry.
   * Adds new backends, closes removed ones, and reconnects changed URLs.
   */
  async reconcile(): Promise<void> {
    const desired = this.configService.get().servers;
    const desiredNames = new Set(desired.map((server) => server.name));

    const knownNames = new Set([
      ...this.connections.keys(),
      ...this.userConnections.keys(),
    ]);

    for (const name of knownNames) {
      if (desiredNames.has(name)) {
        continue;
      }
      const existing = this.connections.get(name);
      if (existing?.client) {
        await existing.client.close();
      }
      this.connections.delete(name);
      await this.closeAllUserConnectionsForServer(name);
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
        await this.closeAllUserConnectionsForServer(server.name);
        await this.reconnect(server.name);
      }
    }
  }

  /**
   * Ensures a backend has a live MCP client. Used when an agent principal is
   * available so user_oauth handshakes can attach Authorization (boot connect
   * often fails open without a principal against auth-required MCP servers).
   */
  async ensureConnected(
    name: string,
    ownerId?: string,
  ): Promise<BackendConnection> {
    const effectiveOwnerId = ownerId ?? tryGetAgentPrincipal()?.ownerId;
    const existing = this.get(name, effectiveOwnerId);
    if (existing?.state === "connected" && existing.client) {
      return existing;
    }

    await this.reconnect(name, effectiveOwnerId);
    const connection = this.get(name, effectiveOwnerId);
    if (!connection) {
      throw new Error(`Unknown server: ${name}`);
    }
    return connection;
  }

  /**
   * Reconnects every user_oauth backend that is not currently connected.
   * No-op for backends that are already up.
   */
  async ensureUserOAuthConnected(ownerId?: string): Promise<void> {
    const effectiveOwnerId = ownerId ?? tryGetAgentPrincipal()?.ownerId;
    const targets = this.list(effectiveOwnerId).filter(
      (connection) =>
        connection.config.credential.strategy === "user_oauth" &&
        !(connection.state === "connected" && connection.client),
    );
    await Promise.all(
      targets.map((connection) =>
        this.ensureConnected(connection.config.name, effectiveOwnerId),
      ),
    );
  }

  /**
   * Closes and evicts cached user_oauth MCP client connections for an owner
   * (optionally scoped to a single OAuth provider key).
   */
  async evictOwnerConnections(
    ownerId: string,
    provider?: string,
  ): Promise<void> {
    for (const [serverName, ownerMap] of this.userConnections.entries()) {
      const existing = ownerMap.get(ownerId);
      if (!existing) {
        continue;
      }
      const config =
        this.configService.getServer(serverName) ?? existing.config;
      if (config.credential.strategy !== "user_oauth") {
        continue;
      }
      if (provider && config.credential.provider !== provider) {
        continue;
      }

      ownerMap.delete(ownerId);
      if (existing.client) {
        await existing.client.close().catch(() => {});
      }

      const fallback = this.get(serverName, ownerId);
      if (fallback) {
        this.notifyStateChange(fallback, ownerId);
      }
    }
  }

  async closeAll(): Promise<void> {
    const closes: Promise<void>[] = [];
    for (const connection of this.connections.values()) {
      if (connection.client) {
        closes.push(connection.client.close().catch(() => {}));
      }
    }
    for (const ownerMap of this.userConnections.values()) {
      for (const connection of ownerMap.values()) {
        if (connection.client) {
          closes.push(connection.client.close().catch(() => {}));
        }
      }
      ownerMap.clear();
    }
    await Promise.all(closes);
  }

  get(name: string, ownerId?: string): BackendConnection | undefined {
    const base = this.connections.get(name);
    const ownerMap = this.userConnections.get(name);
    const config =
      base?.config ??
      ownerMap?.values().next().value?.config ??
      this.configService.getServer(name);
    if (!config) {
      return undefined;
    }

    if (config.credential.strategy !== "user_oauth") {
      return base;
    }

    const effectiveOwnerId = ownerId ?? tryGetAgentPrincipal()?.ownerId;
    if (effectiveOwnerId !== undefined) {
      const userConn = ownerMap?.get(effectiveOwnerId);
      if (userConn) {
        return userConn;
      }
      if (base?.state === "connected" && base.client) {
        return base;
      }
      return {
        config,
        state: base?.state === "connecting" ? "connecting" : "failed",
        client: null,
        error:
          base?.error ??
          new Error("AgentPrincipal not set on request context"),
      };
    }

    if (base?.state === "connected" && base.client) {
      return base;
    }

    if (ownerMap) {
      for (const conn of ownerMap.values()) {
        if (conn.state === "connected" && conn.client) {
          return conn;
        }
      }
      if (!base) {
        return ownerMap.values().next().value;
      }
    }

    return base;
  }

  list(ownerId?: string): BackendConnection[] {
    const names = new Set<string>([
      ...this.connections.keys(),
      ...this.userConnections.keys(),
    ]);
    const results: BackendConnection[] = [];
    for (const name of names) {
      const connection = this.get(name, ownerId);
      if (connection) {
        results.push(connection);
      }
    }
    return results;
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
  rebroadcast(name?: string, ownerId?: string): void {
    const effectiveOwnerId = ownerId ?? tryGetAgentPrincipal()?.ownerId;
    const names =
      name !== undefined
        ? [name]
        : [
            ...new Set([
              ...this.connections.keys(),
              ...this.userConnections.keys(),
            ]),
          ];

    for (const serverName of names) {
      const connection = this.get(serverName, effectiveOwnerId);
      if (!connection) {
        continue;
      }
      if (connection.config.credential.strategy !== "user_oauth") {
        this.notifyStateChange(connection);
        continue;
      }
      if (effectiveOwnerId !== undefined) {
        this.notifyStateChange(connection, effectiveOwnerId);
        continue;
      }
      this.notifyStateChange(connection);
      const ownerMap = this.userConnections.get(serverName);
      if (ownerMap) {
        for (const [ownerKey, userConn] of ownerMap.entries()) {
          this.notifyStateChange(userConn, ownerKey);
        }
      }
    }
  }

  private ensureUnscopedBaseline(server: ServerConfig): void {
    if (!this.connections.has(server.name)) {
      this.connections.set(server.name, {
        config: server,
        state: "failed",
        client: null,
        error: new Error("AgentPrincipal not set on request context"),
      });
    }
  }

  private getOrCreateOwnerMap(
    serverName: string,
  ): Map<string, BackendConnection> {
    let map = this.userConnections.get(serverName);
    if (!map) {
      map = new Map<string, BackendConnection>();
      this.userConnections.set(serverName, map);
    }
    return map;
  }

  private async closeAllUserConnectionsForServer(
    serverName: string,
  ): Promise<void> {
    const ownerMap = this.userConnections.get(serverName);
    if (!ownerMap) {
      return;
    }
    await Promise.all(
      [...ownerMap.values()]
        .map((conn) => conn.client?.close().catch(() => {}))
        .filter((p): p is Promise<void> => p !== undefined),
    );
    this.userConnections.delete(serverName);
  }

  private setConnection(name: string, connection: BackendConnection): void {
    this.connections.set(name, connection);
    this.notifyStateChange(connection);
  }

  private setUserConnection(
    name: string,
    ownerId: string,
    connection: BackendConnection,
  ): void {
    this.getOrCreateOwnerMap(name).set(ownerId, connection);
    this.notifyStateChange(connection, ownerId);
  }

  private notifyStateChange(
    connection: BackendConnection,
    ownerId?: string,
  ): void {
    for (const listener of this.stateListeners) {
      listener(connection, ownerId);
    }
  }

  private async connectServer(
    server: ServerConfig,
    ownerId?: string,
  ): Promise<void> {
    const isScopedUserOAuth =
      server.credential.strategy === "user_oauth" && ownerId !== undefined;

    try {
      const connectFn = () => this.connector.connect(server);
      const client =
        isScopedUserOAuth && tryGetAgentPrincipal()?.ownerId !== ownerId
          ? await runWithAgentPrincipal(
              operatorReconnectPrincipal(ownerId),
              connectFn,
            )
          : await connectFn();

      const connected: BackendConnection = {
        config: server,
        state: "connected",
        client,
      };
      if (isScopedUserOAuth) {
        this.setUserConnection(server.name, ownerId, connected);
      } else {
        this.setConnection(server.name, connected);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("connection.failed", {
        server: server.name,
        url: server.transport.url,
        ...(ownerId ? { ownerId } : {}),
        error: err.message,
      });
      const failed: BackendConnection = {
        config: server,
        state: "failed",
        client: null,
        error: err,
      };
      if (isScopedUserOAuth) {
        this.setUserConnection(server.name, ownerId, failed);
      } else {
        this.setConnection(server.name, failed);
      }
    }
  }
}
