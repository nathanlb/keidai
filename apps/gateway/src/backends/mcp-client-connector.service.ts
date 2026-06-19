import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ServerConfig } from "@torii/shared";
import { inject, injectable } from "tsyringe";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import { CredentialResolutionError, LinkingRequiredError } from "../credentials/types/credential-resolution.js";
import type {
  McpClient,
  McpClientConnector,
} from "./types/mcp-client-connector.js";

function createCredentialFetch(
  server: ServerConfig,
  credentialResolver: CredentialResolverService,
  baseFetch: FetchLike = fetch,
): FetchLike {
  return async (input, init) => {
    let credentialHeaders: Record<string, string> = {};
    try {
      const resolved = await credentialResolver.resolve(server);
      credentialHeaders = resolved.headers;
    } catch (error) {
      if (
        !(error instanceof CredentialResolutionError) &&
        !(error instanceof LinkingRequiredError)
      ) {
        throw error;
      }
    }

    const headers = new Headers(init?.headers);

    for (const [name, value] of Object.entries(credentialHeaders)) {
      headers.set(name, value);
    }

    return baseFetch(input, { ...init, headers });
  };
}

@injectable()
export class DefaultMcpClientConnector implements McpClientConnector {
  constructor(
    @inject(CredentialResolverService)
    private readonly credentialResolver: CredentialResolverService,
  ) {}

  async connect(server: ServerConfig): Promise<McpClient> {
    if (server.transport.type !== "http") {
      throw new Error(
        `Unsupported transport type for server "${server.name}"`,
      );
    }

    const client = new Client({
      name: "open-torii-gateway",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(server.transport.url),
      {
        fetch: createCredentialFetch(server, this.credentialResolver),
        reconnectionOptions: {
          maxReconnectionDelay: 1000,
          initialReconnectionDelay: 100,
          reconnectionDelayGrowFactor: 1.5,
          maxRetries: 0,
        },
      },
    );

    await client.connect(transport);
    return client;
  }
}
