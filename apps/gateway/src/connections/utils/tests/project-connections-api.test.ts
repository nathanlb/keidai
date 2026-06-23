import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectPublicConnection } from "../project-connections-api.js";

describe("project-connections-api", () => {
  it("projects connection state without internal client handles", () => {
    const projected = projectPublicConnection({
      config: {
        name: "github",
        transport: { type: "http", url: "https://example.com/mcp" },
        credential: { strategy: "none" },
        policy: { default: "deny" },
      },
      state: "failed",
      client: null,
      error: new Error("connection refused"),
    });

    assert.deepEqual(projected, {
      name: "github",
      state: "failed",
      error: "connection refused",
    });
    assert.equal(JSON.stringify(projected).includes("client"), false);
  });
});
