import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Pull human-readable error text from an MCP tool result when `isError` is set. */
export function formatBackendToolError(result: CallToolResult): string {
  const messages = (result.content ?? [])
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0);

  if (messages.length > 0) {
    return messages.join("\n");
  }

  return "backend returned error result";
}
