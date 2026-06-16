import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@torii/shared";
import { ToriiConfigService } from "../torii-config.service.js";

const sampleConfig: ToriiConfig = {
  oauth_providers: {},
  servers: [
    {
      name: "github",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "none" },
      policy: { default: "deny" },
    },
  ],
};

describe("ToriiConfigService", () => {
  it("exposes the loaded config and server lookup", () => {
    const service = new ToriiConfigService(sampleConfig);

    assert.equal(service.get().servers.length, 1);
    assert.equal(service.getServer("github")?.name, "github");
    assert.equal(service.getServer("missing"), undefined);
  });
});
