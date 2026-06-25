import "reflect-metadata";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import { describe, it, before } from "node:test";
import type { AgentPrincipal, ToriiConfig } from "@keidai/shared";
import { PolicyDecision } from "@keidai/shared";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ConnectionManager } from "../../connections/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../connections/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../connections/tests/mock-mcp-server.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { ToolDispatchService } from "../../dispatch/tool-dispatch.service.js";
import { InMemoryAgentRegistry } from "../../identity/registry/in-memory-agent-registry.service.js";
import { K8sSaOidcIdentityResolver } from "../../identity/resolvers/k8s-sa-oidc-identity-resolver.service.js";
import type { K8sSaOidcConfig } from "../../identity/types/k8s-sa-oidc-config.js";
import { createTestGatewayHttpServer } from "../../http/tests/test-helpers.js";
import {
  connectAgentToGateway,
  createInboundIdentityService,
  FixedIdentityResolver,
  TEST_AGENT_BEARER,
} from "../../identity/tests/test-helpers.js";
import { CapturingTraceEmitter } from "../../trace/tests/capturing-trace-emitter.js";
import { createPolicyEnforcement } from "../../policy/tests/test-helpers.js";
import { createNoopLogger } from "../../logging/tests/test-helpers.js";

const ISSUER = "https://kubernetes.default.svc.cluster.local";
const AUDIENCE = "https://kubernetes.default.svc.cluster.local";
const NAMESPACE = "torii-agents";
const SERVICE_ACCOUNT = "catalog-agent";

const EXPECTED_PRINCIPAL: AgentPrincipal = {
  agentId: "agent-catalog-01",
  ownerId: "user-alice",
  groups: ["agents"],
};

const oidcConfig: K8sSaOidcConfig = {
  issuer: ISSUER,
  audience: AUDIENCE,
  jwksUri: "https://kubernetes.default.svc/openid/v1/jwks",
};

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

interface TestKeys {
  privateKey: PrivateKey;
  publicJwk: JWK;
  otherPrivateKey: PrivateKey;
}

let keys: TestKeys;

async function createTestKeys(): Promise<TestKeys> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.alg = "RS256";
  publicJwk.kid = "test-key";
  return { privateKey, publicJwk, otherPrivateKey };
}

function createIdentityResolver(): K8sSaOidcIdentityResolver {
  const registry = new InMemoryAgentRegistry(
    new Map([[`${NAMESPACE}/${SERVICE_ACCOUNT}`, EXPECTED_PRINCIPAL]]),
  );
  const verifyKey = async (header: { kid?: string }) => {
    if (header.kid && header.kid !== keys.publicJwk.kid) {
      throw new Error("Unknown key id");
    }
    return crypto.subtle.importKey(
      "jwk",
      keys.publicJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  };

  return new K8sSaOidcIdentityResolver(registry, oidcConfig, verifyKey);
}

async function signToken(privateKey: PrivateKey): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(`system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}`)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

function noneServer(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: { strategy: "none" },
    policy: { default: "deny", allow: ["read_wiki_structure"] },
  };
}

async function closeManagerConnections(
  manager: ConnectionManager,
): Promise<void> {
  await Promise.all(
    manager
      .list()
      .map((connection) => connection.client?.close())
      .filter((close): close is Promise<void> => close !== undefined),
  );
}

describe("Gateway inbound identity", () => {
  before(async () => {
    keys = await createTestKeys();
  });

  it("resolves a valid credential and flows end-to-end with the principal in context", async () => {
    const backend = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      agents: [
        {
          subject: {
            kind: "k8s_service_account",
            namespace: NAMESPACE,
            service_account: SERVICE_ACCOUNT,
          },
          agent_id: EXPECTED_PRINCIPAL.agentId,
          owner_id: EXPECTED_PRINCIPAL.ownerId,
          groups: EXPECTED_PRINCIPAL.groups,
        },
      ],
      servers: [noneServer("deepwiki", backend.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
    const traceEmitter = new CapturingTraceEmitter();
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      traceEmitter,
      createPolicyEnforcement(configService),
    );
    const gatewayHttpServer = createTestGatewayHttpServer(
      toolCatalog,
      toolDispatch,
      {
        identityResolver: createIdentityResolver(),
        traceEmitter,
      },
    );

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayHttpServer.start();
      const token = await signToken(keys.privateKey);
      const agent = await connectAgentToGateway(gateway.url, token);

      try {
        await agent.client.listTools();

        const result = await agent.client.callTool({
          name: "deepwiki.read_wiki_structure",
          arguments: {},
        });
        assert.notEqual(result.isError, true);

        const trace = traceEmitter.traces.at(-1);
        assert.ok(trace);
        assert.deepEqual(trace.principal, {
          agentId: EXPECTED_PRINCIPAL.agentId,
          ownerId: EXPECTED_PRINCIPAL.ownerId,
        });
        assert.equal(trace.policyDecision, PolicyDecision.Allowed);
      } finally {
        await agent.close();
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
    }
  });

  it("rejects an invalid credential before policy and emits a trace", async () => {
    const backend = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });

    const configService = new ToriiConfigService({
      oauth_providers: {},
      servers: [noneServer("deepwiki", backend.url)],
    });
    const { credentialResolver } = createCredentialServices();
    const connectionManager = new ConnectionManager(configService, new DefaultMcpClientConnector(credentialResolver), createNoopLogger());
    const toolCatalog = new ToolCatalogService(connectionManager, credentialResolver, createPolicyEnforcement(configService), createNoopLogger());
    const traceEmitter = new CapturingTraceEmitter();
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
      traceEmitter,
      createPolicyEnforcement(configService),
    );
    const gatewayHttpServer = createTestGatewayHttpServer(
      toolCatalog,
      toolDispatch,
      {
        identityResolver: createIdentityResolver(),
        traceEmitter,
      },
    );

    try {
      await connectionManager.connectAll();
      const gateway = await gatewayHttpServer.start();
      const invalidToken = await signToken(keys.otherPrivateKey);

      try {
        const response = await fetch(gateway.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${invalidToken}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "deepwiki.read_wiki_structure",
              arguments: {},
            },
          }),
        });

        assert.equal(response.status, 401);
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        assert.match(body.error?.message ?? "", /identity_denied/i);

        assert.equal(traceEmitter.traces.length, 1);
        const trace = traceEmitter.traces[0]!;
        assert.equal(trace.server, "deepwiki");
        assert.equal(trace.tool, "read_wiki_structure");
        assert.equal(trace.principal, undefined);
        assert.equal(trace.policyDecision, PolicyDecision.Denied);
        assert.match(trace.error ?? "", /signature|validation failed/i);
        assert.equal(trace.durationMs, undefined);
      } finally {
        await gateway.close();
      }
    } finally {
      await closeManagerConnections(connectionManager);
      await backend.close();
    }
  });
});
