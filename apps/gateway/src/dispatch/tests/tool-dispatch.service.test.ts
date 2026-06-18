import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ConnectionManager } from "../../backends/connection-manager.service.js";
import { DefaultMcpClientConnector } from "../../backends/mcp-client-connector.service.js";
import { startMockMcpServer } from "../../backends/tests/mock-mcp-server.js";
import { ToriiConfigService } from "../../config/torii-config.service.js";
import { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { STUB_OBO_SUBJECT } from "../../credentials/utils/obo-subject.js";
import { createCredentialServices } from "../../credentials/tests/test-helpers.js";
import { ToolDispatchService } from "../tool-dispatch.service.js";
import {
  BackendUnavailableError,
  ToolNotFoundError,
} from "../types/tool-dispatch.js";

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

function userOAuthServer(
  name: string,
  url: string,
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: {
      strategy: "user_oauth",
      provider: "github",
      subject: "${request.user}",
    },
    policy: { default: "deny", allow: ["search_issues"] },
  };
}

function serviceKeyServer(
  name: string,
  url: string,
  key = "sk_test_secret_key",
): ToriiConfig["servers"][number] {
  return {
    name,
    transport: { type: "http", url },
    credential: {
      strategy: "service_key",
      key,
    },
    policy: { default: "deny", allow: ["list_customers"] },
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

async function createDispatchStack(
  servers: ToriiConfig["servers"][number][],
): Promise<{
  connectionManager: ConnectionManager;
  toolCatalog: ToolCatalogService;
  toolDispatch: ToolDispatchService;
  close: () => Promise<void>;
}> {
  const { credentialResolver } = createCredentialServices();

  const configService = new ToriiConfigService({
    oauth_providers: {
      github: {
        token_url: "https://github.com/login/oauth/access_token",
        client_id: "client",
        client_secret: "secret",
        scopes: ["repo"],
      },
    },
    servers,
  });
  const connectionManager = new ConnectionManager(
    configService,
    new DefaultMcpClientConnector(credentialResolver),
  );
  const toolCatalog = new ToolCatalogService(
    connectionManager,
    credentialResolver,
  );
  const toolDispatch = new ToolDispatchService(
    toolCatalog,
    connectionManager,
    credentialResolver,
  );

  return {
    connectionManager,
    toolCatalog,
    toolDispatch,
    close: () => closeManagerConnections(connectionManager),
  };
}

describe("ToolDispatchService", () => {
  it("routes a namespaced call to the backend bare tool name", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "read_wiki_structure", description: "Read wiki" }],
    });
    const stack = await createDispatchStack([
      noneServer("deepwiki", mockServer.url),
    ]);

    try {
      await stack.connectionManager.connectAll();
      await stack.toolCatalog.refresh();

      const result = await stack.toolDispatch.callTool(
        "deepwiki.read_wiki_structure",
        {},
      );

      assert.notEqual(result.isError, true);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("rejects unknown tools", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const stack = await createDispatchStack([
      noneServer("github", mockServer.url),
    ]);

    try {
      await stack.connectionManager.connectAll();
      await stack.toolCatalog.refresh();

      await assert.rejects(
        () => stack.toolDispatch.callTool("github.missing_tool", {}),
        ToolNotFoundError,
      );
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("rejects calls when the backend is failed", async () => {
    const mockServer = await startMockMcpServer({
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const stack = await createDispatchStack([
      noneServer("github", mockServer.url),
    ]);

    try {
      await stack.connectionManager.connectAll();
      await stack.toolCatalog.refresh();

      const connection = stack.connectionManager.get("github");
      assert.ok(connection);
      connection.state = "failed";
      connection.client = null;
      connection.error = new Error("connection lost");

      await assert.rejects(
        () => stack.toolDispatch.callTool("github.search_issues", {}),
        BackendUnavailableError,
      );
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });

  it("rejects calls when user_oauth credentials are missing", async () => {
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      tools: [{ name: "search_issues", description: "Search issues" }],
    });
    const { tokenRepository, credentialResolver } = createCredentialServices();
    const configService = new ToriiConfigService({
      oauth_providers: {
        github: {
          token_url: "https://github.com/login/oauth/access_token",
          client_id: "client",
          client_secret: "secret",
          scopes: ["repo"],
        },
      },
      servers: [userOAuthServer("github", mockServer.url)],
    });
    const connectionManager = new ConnectionManager(
      configService,
      new DefaultMcpClientConnector(credentialResolver),
    );
    const toolCatalog = new ToolCatalogService(
      connectionManager,
      credentialResolver,
    );
    const toolDispatch = new ToolDispatchService(
      toolCatalog,
      connectionManager,
      credentialResolver,
    );

    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message?: unknown) => {
      errors.push(String(message));
    };

    try {
      await tokenRepository.set(STUB_OBO_SUBJECT, "github", {
        accessToken: "gho_valid",
      });
      await connectionManager.connectAll();
      await toolCatalog.refresh();
      await tokenRepository.set(STUB_OBO_SUBJECT, "github", {
        accessToken: "gho_valid",
        expiresAt: new Date(0),
      });

      await assert.rejects(
        () => toolDispatch.callTool("github.search_issues", {}),
        /No valid OAuth token/,
      );
      assert.equal(errors.length, 1);
      assert.match(errors[0] ?? "", /No valid OAuth token/);
    } finally {
      console.error = originalError;
      await closeManagerConnections(connectionManager);
      await mockServer.close();
    }
  });

  it("calls stripe with service_key credentials", async () => {
    const secretKey = "sk_test_secret_key";
    const mockServer = await startMockMcpServer({
      requireAuth: true,
      expectedBearer: secretKey,
      tools: [{ name: "list_customers", description: "List customers" }],
    });
    const stack = await createDispatchStack([
      serviceKeyServer("stripe", mockServer.url, secretKey),
    ]);

    try {
      await stack.connectionManager.connectAll();
      await stack.toolCatalog.refresh();

      const result = await stack.toolDispatch.callTool("stripe.list_customers", {});

      assert.notEqual(result.isError, true);
    } finally {
      await stack.close();
      await mockServer.close();
    }
  });
});
