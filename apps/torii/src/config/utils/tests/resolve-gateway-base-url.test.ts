import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ToriiConfig } from "@keidai/shared";
import { resolveGatewayBaseUrl } from "../resolve-gateway-base-url.js";

describe("resolveGatewayBaseUrl", () => {
  it("prefers gateway_base_url from config", () => {
    const config: ToriiConfig = {
      gateway_base_url: "https://torii.example.com",
      oauth_providers: {},
      servers: [
        {
          name: "x",
          transport: { type: "http", url: "https://example.com/mcp" },
          credential: { strategy: "none" },
          policy: { default: "allow" },
        },
      ],
    };

    assert.equal(resolveGatewayBaseUrl(config), "https://torii.example.com");
  });

  it("strips trailing slash from configured base URL", () => {
    const config: ToriiConfig = {
      gateway_base_url: "https://torii.example.com/",
      oauth_providers: {},
      servers: [
        {
          name: "x",
          transport: { type: "http", url: "https://example.com/mcp" },
          credential: { strategy: "none" },
          policy: { default: "allow" },
        },
      ],
    };

    assert.equal(resolveGatewayBaseUrl(config), "https://torii.example.com");
  });

  it("falls back to TORII_HOST and TORII_PORT when no request is available", () => {
    const previousHost = process.env.TORII_HOST;
    const previousPort = process.env.TORII_PORT;
    process.env.TORII_HOST = "127.0.0.1";
    process.env.TORII_PORT = "3100";

    try {
      assert.equal(
        resolveGatewayBaseUrl({ oauth_providers: {}, servers: [] }),
        "http://127.0.0.1:3100",
      );
    } finally {
      if (previousHost === undefined) {
        delete process.env.TORII_HOST;
      } else {
        process.env.TORII_HOST = previousHost;
      }
      if (previousPort === undefined) {
        delete process.env.TORII_PORT;
      } else {
        process.env.TORII_PORT = previousPort;
      }
    }
  });
});
