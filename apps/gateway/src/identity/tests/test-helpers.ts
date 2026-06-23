import type {
  AgentIdentityResolver,
  AgentPrincipal,
} from "@keidai/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InboundIdentityService } from "../inbound-identity.service.js";
import { STUB_AGENT_PRINCIPAL } from "../stub-agent-principal.js";

export class FixedIdentityResolver implements AgentIdentityResolver {
  constructor(private readonly principal: AgentPrincipal = STUB_AGENT_PRINCIPAL) {}

  async resolve(_credential: string): Promise<AgentPrincipal> {
    return Object.freeze({
      agentId: this.principal.agentId,
      ownerId: this.principal.ownerId,
      groups: [...this.principal.groups],
    });
  }
}

export function createInboundIdentityService(
  resolver: AgentIdentityResolver = new FixedIdentityResolver(),
): InboundIdentityService {
  return new InboundIdentityService(resolver);
}

export const TEST_AGENT_BEARER = "test-agent-credential";

export async function connectAgentToGateway(
  gatewayUrl: string,
  bearerToken: string = TEST_AGENT_BEARER,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const client = new Client({
    name: "integration-test-agent",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(new URL(gatewayUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
      },
    },
    reconnectionOptions: {
      maxReconnectionDelay: 1000,
      initialReconnectionDelay: 100,
      reconnectionDelayGrowFactor: 1.5,
      maxRetries: 0,
    },
  });
  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}
