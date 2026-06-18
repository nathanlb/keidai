import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConfigValidationError, loadConfigFromDocument } from "../loader.js";

const validEnv = {
  GITHUB_CLIENT_ID: "gh-client-id",
  GITHUB_CLIENT_SECRET: "gh-client-secret",
  STRIPE_RESTRICTED_KEY: "sk_test_123",
};

const validDocument = {
  oauth_providers: {
    github: {
      token_url: "https://github.com/login/oauth/access_token",
      client_id: "${env:GITHUB_CLIENT_ID}",
      client_secret: "${env:GITHUB_CLIENT_SECRET}",
      scopes: ["repo"],
    },
  },
  servers: [
    {
      name: "github",
      transport: {
        type: "http",
        url: "https://api.githubcopilot.com/mcp/",
      },
      credential: {
        strategy: "user_oauth",
        provider: "github",
      },
      policy: {
        default: "deny",
        allow: ["search_issues"],
      },
    },
    {
      name: "stripe",
      transport: {
        type: "http",
        url: "https://mcp.stripe.com",
      },
      credential: {
        strategy: "service_key",
        key: "${env:STRIPE_RESTRICTED_KEY}",
      },
      policy: {
        default: "deny",
        allow: ["list_customers"],
      },
    },
    {
      name: "deepwiki",
      transport: {
        type: "http",
        url: "https://mcp.deepwiki.com/mcp",
      },
      credential: {
        strategy: "none",
      },
      policy: {
        default: "deny",
        allow: ["read_wiki_structure"],
      },
    },
  ],
};

function expectValidationError(
  fn: () => unknown,
  expectedMessages: string[],
): void {
  assert.throws(fn, (error: unknown) => {
    if (!(error instanceof ConfigValidationError)) {
      return false;
    }
    for (const message of expectedMessages) {
      assert.ok(
        error.errors.some((entry) => entry.includes(message)),
        `Expected error containing "${message}", got:\n${error.errors.join("\n")}`,
      );
    }
    return true;
  });
}

describe("loadConfigFromDocument", () => {
  it("loads a valid config and resolves env refs", () => {
    const config = loadConfigFromDocument(validDocument, validEnv);

    assert.equal(config.servers.length, 3);
    assert.equal(config.oauth_providers.github?.client_id, "gh-client-id");
    assert.equal(
      config.oauth_providers.github?.client_secret,
      "gh-client-secret",
    );
    assert.equal(
      config.servers[0]?.credential.strategy === "user_oauth"
        ? config.servers[0].credential.provider
        : undefined,
      "github",
    );
    assert.equal(
      config.servers[1]?.credential.strategy === "service_key"
        ? config.servers[1].credential.key
        : undefined,
      "sk_test_123",
    );
  });

  it("lists all missing env vars at once", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(validDocument, {
          GITHUB_CLIENT_ID: "gh-client-id",
        }),
      [
        "Missing environment variable: GITHUB_CLIENT_SECRET",
        "Missing environment variable: STRIPE_RESTRICTED_KEY",
      ],
    );
  });

  it("fails when user_oauth references an unknown provider", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            oauth_providers: {},
          },
          validEnv,
        ),
      ['user_oauth provider "github" is not defined in oauth_providers'],
    );
  });

  it("fails on duplicate server names", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            servers: [
              validDocument.servers[0],
              {
                ...validDocument.servers[0],
                transport: {
                  type: "http",
                  url: "https://example.com/mcp",
                },
              },
            ],
          },
          validEnv,
        ),
      ['duplicate server name "github"'],
    );
  });

  it("fails when none credential declares extra fields", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            servers: [
              {
                name: "deepwiki",
                transport: {
                  type: "http",
                  url: "https://mcp.deepwiki.com/mcp",
                },
                credential: {
                  strategy: "none",
                  key: "should-not-be-here",
                },
                policy: {
                  default: "deny",
                },
              },
            ],
          },
          validEnv,
        ),
      ["Unrecognized key(s) in object: 'key'"],
    );
  });

  it("fails when user_oauth declares a subject field", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            servers: [
              {
                ...validDocument.servers[0],
                credential: {
                  strategy: "user_oauth",
                  provider: "github",
                  subject: "${request.user}",
                },
              },
            ],
          },
          validEnv,
        ),
      ["Unrecognized key(s) in object: 'subject'"],
    );
  });

  it("fails when service_key is missing a key field", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            servers: [
              {
                name: "stripe",
                transport: {
                  type: "http",
                  url: "https://mcp.stripe.com",
                },
                credential: {
                  strategy: "service_key",
                },
                policy: {
                  default: "deny",
                },
              },
            ],
          },
          validEnv,
        ),
      ["servers.0.credential.key: Required"],
    );
  });

  it("loads service_key with an optional inject.header override", () => {
    const config = loadConfigFromDocument(
      {
        ...validDocument,
        servers: [
          {
            name: "stripe",
            transport: {
              type: "http",
              url: "https://mcp.stripe.com",
            },
            credential: {
              strategy: "service_key",
              key: "${env:STRIPE_RESTRICTED_KEY}",
              inject: { header: "X-Api-Key" },
            },
            policy: { default: "deny" },
          },
        ],
      },
      validEnv,
    );

    const credential = config.servers[0]?.credential;
    assert.equal(credential?.strategy, "service_key");
    if (credential?.strategy === "service_key") {
      assert.equal(credential.key, "sk_test_123");
      assert.equal(credential.inject?.header, "X-Api-Key");
    }
  });
});
