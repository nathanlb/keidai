import type { ConnectorAuthMode } from "./connector.js";

export const CONNECTOR_CATALOG_VERSION = "1";

export type CatalogSetup =
  | { kind: "discovered" }
  | {
      kind: "byo_oauth";
      issuerHint: string;
      authorizeUrl: string;
      tokenUrl: string;
      scopes: string[];
      consoleUrl: string;
      instructions: string;
      authorizeParams?: Record<string, string>;
    }
  | { kind: "api_key"; header?: string; docsUrl: string };

export interface CatalogEntry {
  id: string;
  displayName: string;
  description: string;
  icon: string;
  url: string;
  authMode: ConnectorAuthMode;
  setup: CatalogSetup;
}

export const CONNECTOR_CATALOG: readonly CatalogEntry[] = [
  {
    id: "notion",
    displayName: "Notion",
    description: "Read and write Notion pages, databases, and comments.",
    icon: "notion",
    url: "https://mcp.notion.com/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "linear",
    displayName: "Linear",
    description: "Issues, projects, and cycles via Linear's hosted MCP server.",
    icon: "linear",
    url: "https://mcp.linear.app/mcp",
    authMode: "service_key",
    setup: {
      kind: "api_key",
      docsUrl: "https://linear.app/settings/api",
    },
  },
  {
    id: "github",
    displayName: "GitHub",
    description: "Repos, issues, pull requests, and Actions through GitHub MCP.",
    icon: "github",
    url: "https://api.githubcopilot.com/mcp/",
    authMode: "user_oauth",
    setup: {
      kind: "byo_oauth",
      issuerHint: "https://github.com/login/oauth",
      authorizeUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      scopes: ["repo", "read:user"],
      consoleUrl: "https://github.com/settings/developers",
      instructions:
        "Create an OAuth App. Set the callback URL to {callback}. Paste the client ID and secret here.",
    },
  },
  {
    id: "gmail",
    displayName: "Gmail",
    description: "Read, draft, and send mail through Google's Gmail MCP server.",
    icon: "gmail",
    url: "https://gmailmcp.googleapis.com/mcp/v1",
    authMode: "user_oauth",
    setup: {
      kind: "byo_oauth",
      issuerHint: "https://accounts.google.com",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
        "https://www.googleapis.com/auth/gmail.drafts",
      ],
      consoleUrl: "https://console.cloud.google.com/apis/credentials",
      instructions:
        "Create an OAuth 2.0 Client ID (Web application). Add {callback} as an authorized redirect URI and {origin} as an authorized JavaScript origin.",
      authorizeParams: { access_type: "offline", prompt: "consent" },
    },
  },
  {
    id: "google-calendar",
    displayName: "Google Calendar",
    description: "List and manage events on Google Calendar.",
    icon: "google",
    url: "https://calendar-mcp.googleapis.com/mcp/v1",
    authMode: "user_oauth",
    setup: {
      kind: "byo_oauth",
      issuerHint: "https://accounts.google.com",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["https://www.googleapis.com/auth/calendar"],
      consoleUrl: "https://console.cloud.google.com/apis/credentials",
      instructions:
        "Reuse a Google OAuth client or create one. Add {callback} as an authorized redirect URI.",
      authorizeParams: { access_type: "offline", prompt: "consent" },
    },
  },
  {
    id: "atlassian",
    displayName: "Atlassian",
    description: "Jira and Confluence through Atlassian's remote MCP server.",
    icon: "atlassian",
    url: "https://mcp.atlassian.com/v1/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "sentry",
    displayName: "Sentry",
    description: "Issues, traces, and project data from Sentry.",
    icon: "sentry",
    url: "https://mcp.sentry.dev/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "asana",
    displayName: "Asana",
    description: "Tasks, projects, and comments in Asana.",
    icon: "asana",
    url: "https://mcp.asana.com/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "stripe",
    displayName: "Stripe",
    description: "Customers, payments, and products via a restricted Stripe key.",
    icon: "stripe",
    url: "https://mcp.stripe.com",
    authMode: "service_key",
    setup: {
      kind: "api_key",
      docsUrl: "https://dashboard.stripe.com/apikeys",
    },
  },
  {
    id: "slack",
    displayName: "Slack",
    description: "Channels, messages, and search through Slack's MCP server.",
    icon: "slack",
    url: "https://mcp.slack.com/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare",
    description: "Workers, KV, and DNS through Cloudflare's MCP server.",
    icon: "cloudflare",
    url: "https://mcp.cloudflare.com/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "vercel",
    displayName: "Vercel",
    description: "Projects, deployments, and logs on Vercel.",
    icon: "vercel",
    url: "https://mcp.vercel.com",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((entry) => entry.id === id);
}
