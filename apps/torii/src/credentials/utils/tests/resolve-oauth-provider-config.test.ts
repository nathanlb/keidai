import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OAuthProviderConfig } from "@keidai/shared";
import { InMemoryOAuthClientRepository } from "../../in-memory-oauth-client-repository.service.js";
import { ensureRegisteredOAuthClient } from "../resolve-oauth-provider-config.js";

const notionConfig: OAuthProviderConfig = {
  authorize_url: "https://mcp.notion.com/authorize",
  token_url: "https://mcp.notion.com/token",
  registration_endpoint: "https://mcp.notion.com/register",
  scopes: [],
};

describe("ensureRegisteredOAuthClient", () => {
  it("re-registers dynamic clients when the redirect URI changes", async () => {
    const clientRepository = new InMemoryOAuthClientRepository();
    const loopbackRedirect = "https://127.0.0.1:8765/callback";
    const gatewayRedirect = "http://127.0.0.1:3100/oauth/callback/notion";

    const originalFetch = globalThis.fetch;
    let registrationCount = 0;
    globalThis.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url === notionConfig.registration_endpoint) {
        registrationCount += 1;
        const body = JSON.parse(String(init?.body)) as {
          redirect_uris: string[];
        };
        return new Response(
          JSON.stringify({
            client_id: `notion-client-${registrationCount}`,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return originalFetch(input, init);
    };

    try {
      const loopbackConfig = await ensureRegisteredOAuthClient(
        "notion",
        notionConfig,
        loopbackRedirect,
        clientRepository,
      );
      assert.equal(loopbackConfig.client_id, "notion-client-1");

      const stored = await clientRepository.get("notion");
      assert.equal(stored?.redirectUri, loopbackRedirect);

      const gatewayConfig = await ensureRegisteredOAuthClient(
        "notion",
        notionConfig,
        gatewayRedirect,
        clientRepository,
      );
      assert.equal(gatewayConfig.client_id, "notion-client-2");
      assert.equal(registrationCount, 2);

      const updated = await clientRepository.get("notion");
      assert.equal(updated?.redirectUri, gatewayRedirect);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
