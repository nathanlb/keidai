import type { MockGatewayConfig } from "../helpers/mock-gateway.js";
import { singleAlphaAgentConfig } from "./agents.js";

export const githubOAuthProvider = {
  token_url: "https://github.com/login/oauth/access_token",
  authorize_url: "https://github.com/login/oauth/authorize",
  client_id: "Iv1.public-client",
  scopes: ["repo", "read:user"],
  pkce: true,
};

export const emptyOAuthProvidersConfig: MockGatewayConfig = {
  oauthProviders: { providers: {} },
};

export const linkedGitHubProvidersConfig: MockGatewayConfig = {
  ...singleAlphaAgentConfig,
  oauthProviders: {
    providers: {
      github: githubOAuthProvider,
    },
  },
  oauthConnections: {
    "owner-a": {
      connections: [
        {
          provider: "github",
          ownerId: "owner-a",
          status: "linked",
          scopes: ["repo", "read:user"],
        },
      ],
    },
  },
};

export const notLinkedGitHubProvidersConfig: MockGatewayConfig = {
  ...singleAlphaAgentConfig,
  oauthProviders: {
    providers: {
      github: githubOAuthProvider,
    },
  },
  oauthConnections: {
    "owner-a": {
      connections: [
        {
          provider: "github",
          ownerId: "owner-a",
          status: "not_linked",
          scopes: [],
        },
      ],
    },
  },
  oauthInitiate: {
    github: {
      authorizationUrl:
        "https://github.com/login/oauth/authorize?state=test",
      linkId: "link-1",
      redirectUri: "http://127.0.0.1:3100/oauth/callback/github",
    },
  },
};
