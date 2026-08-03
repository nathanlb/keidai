import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { resolveBootPrincipal } from "../resolve-boot-principal.js";

const baseConfig: ToriiConfig = {
  boot_owner_id: "ops-owner",
  oauth_providers: {},
  servers: [
    {
      name: "linear",
      transport: { type: "http", url: "https://example.com/mcp" },
      credential: { strategy: "none" },
    },
  ],
};

describe("resolveBootPrincipal", () => {
  it("builds a principal from boot_owner_id", () => {
    assert.deepEqual(resolveBootPrincipal(baseConfig), {
      agentId: "boot",
      ownerId: "ops-owner",
      groups: [],
      bearerId: "boot",
    });
  });
});
