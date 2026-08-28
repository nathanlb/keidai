import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConnectorManagementService } from "../connector-management.service.js";
import { ConnectorRegistry } from "../connector-registry.service.js";
import { PgConnectorRepository } from "../pg-connector-repository.service.js";
import { PgOAuthRegistrationRepository } from "../../credentials/pg-oauth-registration-repository.service.js";
import { PgSecretRepository } from "../../secrets/pg-secret-repository.service.js";
import { createTestGatewayPersistence } from "../../testing/gateway-persistence.js";
import type { ConnectionManager } from "../../connections/connection-manager.service.js";
import type { ToolCatalogService } from "../../catalog/tool-catalog.service.js";
import { ConnectorWriteError } from "../types/connector-write.js";

function stubRuntime(): {
  connections: ConnectionManager;
  catalog: ToolCatalogService;
} {
  return {
    connections: {
      reconcile: async () => {},
      rebroadcast: () => {},
    } as ConnectionManager,
    catalog: {
      refresh: async () => [],
    } as unknown as ToolCatalogService,
  };
}

describe("ConnectorManagementService", () => {
  it("installs a catalog connector and hides secrets on GET", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const pool = persistence.pool!;
      const registry = new ConnectorRegistry();
      const runtime = stubRuntime();
      const management = new ConnectorManagementService(
        new PgConnectorRepository(pool),
        registry,
        new PgSecretRepository(pool),
        new PgOAuthRegistrationRepository(pool),
        persistence.groupPolicyRepository,
        runtime.connections,
        runtime.catalog,
      );

      const created = await management.installFromCatalog({
        catalogId: "github",
        oauthClient: {
          clientId: "gh_oauth_client",
          clientSecret: "gh_oauth_secret_value",
        },
      });
      assert.equal(created.slug, "github");
      assert.equal(created.catalogId, "github");
      assert.equal(created.oauthClient?.set, true);
      assert.equal(
        JSON.stringify(created).includes("gh_oauth_secret_value"),
        false,
      );

      const listed = await management.list();
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.slug, "github");
    } finally {
      await persistence.close();
    }
  });

  it("installs a Class A catalog connector without client credentials", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const pool = persistence.pool!;
      const registry = new ConnectorRegistry();
      const runtime = stubRuntime();
      const management = new ConnectorManagementService(
        new PgConnectorRepository(pool),
        registry,
        new PgSecretRepository(pool),
        new PgOAuthRegistrationRepository(pool),
        persistence.groupPolicyRepository,
        runtime.connections,
        runtime.catalog,
      );

      const created = await management.installFromCatalog({
        catalogId: "linear",
      });
      assert.equal(created.slug, "linear");
      assert.equal(created.authMode, "user_oauth");
      assert.equal(created.oauthClient?.set, false);
    } finally {
      await persistence.close();
    }
  });

  it("rejects deleting a connector referenced by group policy", async () => {
    const persistence = await createTestGatewayPersistence("postgres");
    try {
      const pool = persistence.pool!;
      const registry = new ConnectorRegistry();
      const runtime = stubRuntime();
      const management = new ConnectorManagementService(
        new PgConnectorRepository(pool),
        registry,
        new PgSecretRepository(pool),
        new PgOAuthRegistrationRepository(pool),
        persistence.groupPolicyRepository,
        runtime.connections,
        runtime.catalog,
      );
      await management.create({
        slug: "gmail",
        displayName: "Gmail",
        url: "https://gmail.example/mcp",
        authMode: "none",
      });
      await persistence.groupPolicyRepository.create({
        name: "ops",
        description: "",
        servers: [
          {
            server: "gmail",
            default: "deny",
            allow: [],
            deny: [],
            gated: [],
          },
        ],
      });

      await assert.rejects(
        () => management.delete("gmail"),
        (error: unknown) => {
          assert.ok(error instanceof ConnectorWriteError);
          assert.equal(error.statusCode, 409);
          return true;
        },
      );
    } finally {
      await persistence.close();
    }
  });
});
