import {
  Client,
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  StreamableHTTPClientTransport,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/client";
import type { FetchLike } from "@modelcontextprotocol/client";
import type { ServerConfig } from "@keidai/shared";
import { MCP_PROTOCOL_VERSION } from "@keidai/shared/mcp-jsonrpc";
import { inject, injectable } from "tsyringe";
import { CredentialResolverService } from "../credentials/credential-resolver.service.js";
import { CredentialResolutionError, LinkingRequiredError } from "../credentials/types/credential-resolution.js";
import { ensureOutboundMcpRoutingHeaders } from "./utils/outbound-mcp-headers.js";
import {
  TORII_OUTBOUND_CLIENT_CAPABILITIES,
  TORII_OUTBOUND_CLIENT_INFO,
} from "./utils/post-backend-mcp.js";
import type {
  McpClient,
  McpClientConnector,
} from "./types/mcp-client-connector.js";

/**
 * Auto-negotiate 2026-07-28 when the backend speaks it. On the 2025
 * initialize fallback, offer 2025-03-26 first — SDK 2.0's default latest is
 * 2025-11-25, which many deployed servers reject instead of counter-offering.
 */
const OUTBOUND_SUPPORTED_PROTOCOL_VERSIONS = [
  MCP_PROTOCOL_VERSION,
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  ...SUPPORTED_PROTOCOL_VERSIONS.filter(
    (version) =>
      version !== MCP_PROTOCOL_VERSION &&
      version !== DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  ),
];

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

    // Preserve SDK-set routing headers (`Mcp-Method`, `Mcp-Name`) and overlay
    // resolved credentials so backends see SEP-2243 headers on every POST.
    const headers = new Headers(init?.headers);
    ensureOutboundMcpRoutingHeaders(headers, init?.body);

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

    const client = new Client(TORII_OUTBOUND_CLIENT_INFO, {
      capabilities: TORII_OUTBOUND_CLIENT_CAPABILITIES,
      versionNegotiation: { mode: "auto" },
      supportedProtocolVersions: OUTBOUND_SUPPORTED_PROTOCOL_VERSIONS,
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
