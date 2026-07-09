import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { ConnectionManager } from "../connections/connection-manager.service.js";
import { ToolCatalogService } from "../catalog/tool-catalog.service.js";
import { createContainer } from "../container.js";

const MINIMAL_CONFIG: ToriiConfig = {
  oauth_providers: {},
  servers: [],
  agents: [],
};

describe("createContainer", () => {
  it("shares ConnectionManager across services resolved from the same container", () => {
    const app = createContainer(MINIMAL_CONFIG);
    const connectionManager = app.resolve(ConnectionManager);
    const toolCatalog = app.resolve(ToolCatalogService);

    assert.equal(
      (toolCatalog as unknown as { connectionManager: ConnectionManager })
        .connectionManager,
      connectionManager,
    );
  });
});
