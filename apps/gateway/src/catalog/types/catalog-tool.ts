import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/** Tool surfaced to agents — same MCP shape; `name` is namespaced at runtime. */
export type AgentTool = Tool;

/** One tool entry in the in-memory catalog (bare + namespaced names). */
export interface CatalogTool {
  server: string;
  /** Backend-local tool name — matches `policy.allow` / `policy.deny` in torii.yaml. */
  bareName: string;
  /** Agent-facing name: `<server>.<bareName>`. */
  namespacedName: string;
  /** Full MCP tool shape with namespaced `name` for agent-facing use. */
  tool: AgentTool;
}
