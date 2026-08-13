import type { Tool } from "@modelcontextprotocol/server";

/** Tool surfaced to agents — same MCP shape; `name` is namespaced at runtime. */
export type AgentTool = Tool;

/**
 * Freshness for agent-facing `tools/list`. The catalog is filtered per agent
 * by group policy, so the scope is always `private`.
 */
export const AGENT_TOOL_LIST_TTL_MS = 60_000;
export const AGENT_TOOL_LIST_CACHE_SCOPE = "private" as const;

/** Agent `tools/list` result including SEP-2549 cache hints. */
export interface AgentToolsListResult {
  tools: AgentTool[];
  ttlMs: number;
  cacheScope: typeof AGENT_TOOL_LIST_CACHE_SCOPE;
}

/** One tool entry in the in-memory catalog (bare + namespaced names). */
export interface CatalogTool {
  server: string;
  /** Backend-local tool name — matches group permission tool lists in torii.yaml. */
  bareName: string;
  /** Agent-facing name: `<server>.<bareName>`. */
  namespacedName: string;
  /** Full MCP tool shape with namespaced `name` for agent-facing use. */
  tool: AgentTool;
}
