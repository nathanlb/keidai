import { PolicyDecision } from "@keidai/shared";
import type { TraceListItem } from "@keidai/shared";
import type { PublicServerConfig } from "@keidai/shared/dto";

export const githubServer: PublicServerConfig = {
  name: "github",
  transport: { type: "http", url: "https://api.githubcopilot.com/mcp" },
  credential: { strategy: "user_oauth", provider: "github" },
  policy: { default: "deny", allow: ["search_issues", "get_repo"] },
};

export const stripeServer: PublicServerConfig = {
  name: "stripe",
  transport: { type: "http", url: "https://mcp.stripe.com" },
  credential: {
    strategy: "service_key",
    inject: { header: "Authorization" },
  },
  policy: { default: "deny", allow: ["list_customers"] },
};

export const successTrace: TraceListItem = {
  traceId: "trace-ok",
  timestamp: "2026-06-23T14:32:57.000Z",
  server: "github",
  tool: "search_issues",
  principal: { agentId: "demo-agent", ownerId: "nathanlb" },
  credentialRef: "github:nathanlb",
  policyDecision: PolicyDecision.Allowed,
  durationMs: 118,
  outcome: "success",
};

export const deniedTrace: TraceListItem = {
  traceId: "trace-denied",
  timestamp: "2026-06-23T14:32:30.000Z",
  server: "github",
  tool: "delete_repo",
  principal: { agentId: "demo-agent", ownerId: "nathanlb" },
  policyDecision: PolicyDecision.Denied,
  error: "policy denied",
  outcome: "denied",
};

export const linkingRequiredTrace: TraceListItem = {
  traceId: "trace-linking",
  timestamp: "2026-06-23T14:32:49.000Z",
  server: "github",
  tool: "search_issues",
  principal: { agentId: "triage-bot", ownerId: "nathanlb" },
  credentialRef: "github:nathanlb",
  policyDecision: PolicyDecision.Allowed,
  error:
    'OAuth connection required for provider "github" (backend "github")',
  outcome: "linking_required",
};

export const backendErrorTrace: TraceListItem = {
  traceId: "trace-error",
  timestamp: "2026-06-23T14:32:07.000Z",
  server: "github",
  tool: "list_prs",
  principal: { agentId: "demo-agent", ownerId: "nathanlb" },
  credentialRef: "github:nathanlb",
  policyDecision: PolicyDecision.Allowed,
  durationMs: 1840,
  error: "502 Bad Gateway from api.githubcopilot.com",
  outcome: "error",
};
