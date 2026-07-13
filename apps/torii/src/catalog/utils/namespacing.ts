const NAMESPACED_TOOL_PATTERN = /^([^.]+)\.(.+)$/;

/** Build the agent-facing tool name from server and bare tool names. */
export function namespaceTool(server: string, bareName: string): string {
  return `${server}.${bareName}`;
}

/**
 * Split a namespaced tool name into server and bare components.
 * Returns null when the name is not namespaced.
 */
export function parseNamespacedTool(
  namespacedName: string,
): { server: string; bareName: string } | null {
  const match = NAMESPACED_TOOL_PATTERN.exec(namespacedName);
  if (!match) {
    return null;
  }

  const server = match[1];
  const bareName = match[2];
  if (!server || !bareName) {
    return null;
  }

  return { server, bareName };
}
