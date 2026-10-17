import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { discoverOidcProvider } from "../oidc-discovery.js";

describe("discoverOidcProvider", () => {
  let server: ReturnType<typeof createServer>;
  let issuer = "";

  before(async () => {
    server = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          issuer: "https://idp.example",
          authorization_endpoint: "https://idp.example/authorize",
          token_endpoint: "https://idp.example/token",
          jwks_uri: "https://idp.example/keys",
        }),
      );
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert(address && typeof address === "object");
    issuer = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("reads the discovery document", async () => {
    const metadata = await discoverOidcProvider(`${issuer}/`);
    assert.equal(metadata.issuer, "https://idp.example");
    assert.equal(metadata.authorizationEndpoint, "https://idp.example/authorize");
    assert.equal(metadata.tokenEndpoint, "https://idp.example/token");
    assert.equal(metadata.jwksUri, "https://idp.example/keys");
  });
});
