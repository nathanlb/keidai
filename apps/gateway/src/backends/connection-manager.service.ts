import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { DefaultMcpClientConnector } from "./mcp-client-connector.service.js";
import type { BackendConnection } from "./types/backend-connection.js";
import type { McpClientConnector } from "./types/mcp-client-connector.js";

@injectable()
export class ConnectionManager {
  private readonly connections = new Map<string, BackendConnection>();

  constructor(
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
    @inject(DefaultMcpClientConnector)
    private readonly connector: McpClientConnector,
  ) {}

  async connectAll(): Promise<void> {
    const servers = this.configService.get().servers;

    for (const server of servers) {
      this.connections.set(server.name, {
        config: server,
        state: "connecting",
        client: null,
      });
    }

    await Promise.all(servers.map((server) => this.connectServer(server)));
  }

  get(name: string): BackendConnection | undefined {
    return this.connections.get(name);
  }

  list(): BackendConnection[] {
    return [...this.connections.values()];
  }

  private async connectServer(server: ServerConfig): Promise<void> {
    try {
      const client = await this.connector.connect(server);
      this.connections.set(server.name, {
        config: server,
        state: "connected",
        client,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(
        `Failed to connect to backend "${server.name}" (${server.transport.url}): ${err.message}`,
      );
      this.connections.set(server.name, {
        config: server,
        state: "failed",
        client: null,
        error: err,
      });
    }
  }
}
