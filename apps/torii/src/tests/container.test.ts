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
});
