import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectorsFromConfig } from "../connector-config.js";
import { buildTestConnectors } from "../../../testing/build-test-connectors.js";

describe("connectorsFromConfig", () => {
  it("maps user_oauth servers onto connector records with provider overrides", () => {
    const connectors = connectorsFromConfig({
      oauth_providers: {
        google: {
          token_url: "https://oauth2.googleapis.com/token",
          authorize_url: "https://accounts.google.com/o/oauth2/v2/auth",
          client_id: "id",
          client_secret: "secret",
          scopes: ["email"],
        },
      },
      servers: [
        {
          name: "gmail",
          transport: { type: "http", url: "https://gmail.example/mcp" },
          credential: { strategy: "user_oauth", provider: "google" },
        },
      ],
    });

    assert.equal(connectors[0]?.slug, "gmail");
    assert.equal(connectors[0]?.oauth?.providerKey, "google");
    assert.equal(connectors[0]?.oauth?.clientId, "id");
  });
});

describe("buildTestConnectors", () => {
  it("fills connector defaults for compact fixtures", () => {
    const [connector] = buildTestConnectors([
      { slug: "deepwiki", url: "https://mcp.deepwiki.com/mcp" },
    ]);
    assert.equal(connector?.authMode, "none");
    assert.equal(connector?.displayName, "deepwiki");
    assert.equal(connector?.enabled, true);
  });
});
