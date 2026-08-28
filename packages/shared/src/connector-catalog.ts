import type { ConnectorAuthMode } from "./connector.js";

export const CONNECTOR_CATALOG_VERSION = "5";

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
  /** Simple Icons slug; keidai-ui maps this to a glyph. */
  icon: string;
  url: string;
  authMode: ConnectorAuthMode;
  setup: CatalogSetup;
}

const googleByo = {
  kind: "byo_oauth" as const,
  issuerHint: "https://accounts.google.com",
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  consoleUrl: "https://console.cloud.google.com/apis/credentials",
  authorizeParams: { access_type: "offline", prompt: "consent" },
};

export const CONNECTOR_CATALOG: readonly CatalogEntry[] = [
  {
    id: "gmail",
    displayName: "Gmail",
    description: "Search, read, and draft mail through Google's Gmail MCP server.",
    icon: "gmail",
    url: "https://gmailmcp.googleapis.com/mcp/v1",
    authMode: "user_oauth",
    setup: {
      ...googleByo,
      scopes: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.compose",
      ],
      instructions:
        "Create an OAuth 2.0 Client ID (Web application). Enable the Gmail API and Gmail MCP API. Add {callback} as an authorized redirect URI and {origin} as an authorized JavaScript origin.",
    },
  },
  {
    id: "google-calendar",
    displayName: "Google Calendar",
    description: "List and manage events on Google Calendar.",
    icon: "googlecalendar",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    authMode: "user_oauth",
    setup: {
      ...googleByo,
      scopes: ["https://www.googleapis.com/auth/calendar"],
      instructions:
        "Reuse a Google OAuth client or create one. Enable the Calendar API and Calendar MCP API. Add {callback} as an authorized redirect URI.",
    },
  },
  {
    id: "google-drive",
    displayName: "Google Drive",
    description: "Search, read, and upload files in Google Drive.",
    icon: "googledrive",
    url: "https://drivemcp.googleapis.com/mcp/v1",
    authMode: "user_oauth",
    setup: {
      ...googleByo,
      scopes: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/drive.file",
      ],
      instructions:
        "Reuse a Google OAuth client or create one. Enable the Drive API and Drive MCP API. Add {callback} as an authorized redirect URI.",
    },
  },
  {
    id: "slack",
    displayName: "Slack",
    description: "Channels, messages, and search through Slack's MCP server.",
    icon: "slack",
    url: "https://mcp.slack.com/mcp",
    authMode: "user_oauth",
    setup: {
      kind: "byo_oauth",
      issuerHint: "https://mcp.slack.com",
      authorizeUrl: "https://slack.com/oauth/v2_user/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.user.access",
      scopes: [
        "search:read.public",
        "search:read.private",
        "search:read.users",
        "channels:history",
        "channels:read",
        "chat:write",
        "users:read",
      ],
      consoleUrl: "https://api.slack.com/apps",
      instructions:
        "Create an internal Slack app (Marketplace or internal apps only). Add {callback} as a redirect URL. Paste the client ID and secret here.",
    },
  },
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
    id: "hubspot",
    displayName: "HubSpot",
    description: "CRM contacts, deals, tickets, and marketing through HubSpot.",
    icon: "hubspot",
    url: "https://mcp.hubspot.com",
    authMode: "user_oauth",
    setup: {
      kind: "byo_oauth",
      issuerHint: "https://mcp.hubspot.com",
      authorizeUrl: "https://mcp.hubspot.com/oauth/authorize/user",
      tokenUrl: "https://mcp.hubspot.com/oauth/v3/token",
      scopes: [],
      consoleUrl: "https://app.hubspot.com",
      instructions:
        "In HubSpot, go to Development → MCP Auth Apps. Create an app and set the redirect URL to {callback}. Paste the client ID and secret here.",
    },
  },
  {
    id: "stripe",
    displayName: "Stripe",
    description: "Customers, payments, and products through Stripe's hosted MCP server.",
    icon: "stripe",
    url: "https://mcp.stripe.com",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "airtable",
    displayName: "Airtable",
    description: "Bases, tables, and records in Airtable.",
    icon: "airtable",
    url: "https://mcp.airtable.com/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "zapier",
    displayName: "Zapier",
    description: "Actions across thousands of apps through Zapier's hosted MCP.",
    icon: "zapier",
    url: "https://mcp.zapier.com/api/v1/connect",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "fireflies",
    displayName: "Fireflies",
    description: "Meeting transcripts, summaries, and action items.",
    icon: "fireflies",
    url: "https://api.fireflies.ai/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "dropbox",
    displayName: "Dropbox",
    description: "Files, folders, and sharing in Dropbox.",
    icon: "dropbox",
    url: "https://mcp.dropbox.com/mcp",
    authMode: "user_oauth",
    setup: {
      kind: "byo_oauth",
      issuerHint: "https://www.dropbox.com",
      authorizeUrl: "https://www.dropbox.com/oauth2/authorize",
      tokenUrl: "https://api.dropbox.com/oauth2/token",
      scopes: [
        "account_info.read",
        "files.metadata.read",
        "files.content.read",
        "files.content.write",
        "sharing.read",
        "sharing.write",
        "file_requests.read",
        "file_requests.write",
      ],
      consoleUrl: "https://www.dropbox.com/developers/apps",
      instructions:
        "Create a scoped Dropbox app (Full Dropbox). Enable the listed permissions, add {callback} as a redirect URI, then paste the app key and secret here.",
      authorizeParams: { token_access_type: "offline" },
    },
  },
  {
    id: "posthog",
    displayName: "PostHog",
    description: "Product analytics, feature flags, and error tracking.",
    icon: "posthog",
    url: "https://mcp.posthog.com/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
  },
  {
    id: "linear",
    displayName: "Linear",
    description: "Issues, projects, and cycles via Linear's hosted MCP server.",
    icon: "linear",
    url: "https://mcp.linear.app/mcp",
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
    id: "atlassian",
    displayName: "Atlassian",
    description: "Jira and Confluence through Atlassian's remote MCP server.",
    icon: "atlassian",
    url: "https://mcp.atlassian.com/v1/mcp",
    authMode: "user_oauth",
    setup: { kind: "discovered" },
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
];

export function getCatalogEntry(id: string): CatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((entry) => entry.id === id);
}
