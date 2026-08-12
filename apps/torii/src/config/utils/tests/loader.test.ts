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
    },
  ],
  groups: [
    {
      name: "agents",
      description: "Test agents group",
      permissions: [
        { server: "github", tools: ["search_issues"] },
        { server: "stripe", tools: ["list_customers"] },
        { server: "deepwiki", tools: ["read_wiki_structure"] },
      ],
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
    assert.deepEqual(config.gated_tools, {});
    assert.equal(config.groups?.length, 1);
    assert.equal(config.groups?.[0]?.name, "agents");
  });

  it("loads gated_tools keyed by agent id", () => {
    const config = loadConfigFromDocument(
      {
        ...validDocument,
        gated_tools: {
          "agent-catalog-01": ["github.create_issue"],
        },
      },
      validEnv,
    );

    assert.deepEqual(config.gated_tools, {
      "agent-catalog-01": ["github.create_issue"],
    });
  });

  it("rejects unrecognized agents key", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            agents: [
              {
                agent_id: "agent-catalog-01",
                owner_id: "user-alice",
                groups: [],
              },
            ],
          },
          validEnv,
        ),
      ['Unrecognized key: "agents"'],
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

  it("rejects unrecognized boot_owner_id key", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            boot_owner_id: "test-owner",
          },
          validEnv,
        ),
      ['Unrecognized key: "boot_owner_id"'],
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

  it("fails on duplicate group names", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            groups: [
              {
                name: "agents",
                description: "First agents group",
                permissions: [{ server: "github", tools: ["search_issues"] }],
              },
              {
                name: "agents",
                description: "Duplicate agents group",
                permissions: [{ server: "stripe", tools: ["list_customers"] }],
              },
            ],
          },
          validEnv,
        ),
      ['duplicate group name "agents"'],
    );
  });

  it("fails when a group permission references an unknown server", () => {
    expectValidationError(
      () =>
        loadConfigFromDocument(
          {
            ...validDocument,
            groups: [
              {
                name: "agents",
                description: "Test agents group",
                permissions: [{ server: "unknown-server", tools: ["do_thing"] }],
              },
            ],
          },
          validEnv,
        ),
      ['permission server "unknown-server" is not defined in servers'],
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
              },
            ],
          },
          validEnv,
        ),
      ['Unrecognized key: "key"'],
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
      ['Unrecognized key: "subject"'],
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
              },
            ],
          },
          validEnv,
        ),
      [
        "servers.0.credential.key: Invalid input: expected string, received undefined",
      ],
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
          },
        ],
        groups: [],
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
