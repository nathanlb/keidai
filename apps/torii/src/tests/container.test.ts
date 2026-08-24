import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import {
  createIsolatedSchema,
} from "@keidai/postgres";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { createContainer } from "../container.js";
import { GroupPolicyCache } from "../policy/group-policy-cache.service.js";

const MINIMAL_CONFIG: ToriiConfig = {
  oauth_providers: {},
  servers: [],
};

describe("createContainer", () => {
  it("shares ConnectionManager across services resolved from the same container", async () => {
    const isolated = await createIsolatedSchema();
    try {
      const { container: app } = await createContainer(MINIMAL_CONFIG, {
        pool: isolated.pool,
      });
      const connectionManager = app.resolve(ConnectionManager);
      const toolCatalog = app.resolve(ToolCatalogService);

      assert.equal(
        (toolCatalog as unknown as { connectionManager: ConnectionManager })
          .connectionManager,
        connectionManager,
      );
    } finally {
      await isolated.close();
    }
  });

  it("seeds demo group policy into the cache when the groups table is empty", async () => {
    const isolated = await createIsolatedSchema();
    try {
      const { container: app } = await createContainer(MINIMAL_CONFIG, {
        pool: isolated.pool,
      });
      const cache = app.resolve(GroupPolicyCache);
      const agents = cache.get().find((group) => group.name === "agents");
      assert.ok(agents);
      const gmail = agents.servers.find((policy) => policy.server === "gmail");
      assert.deepEqual(gmail, {
        server: "gmail",
        default: "deny",
        allow: ["create_draft", "list_drafts"],
        deny: [],
        gated: ["create_draft"],
      });
    } finally {
      await isolated.close();
    }
  });
});
