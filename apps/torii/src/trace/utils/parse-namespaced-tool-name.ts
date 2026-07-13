export function parseNamespacedToolName(namespacedName: string): {
  server: string;
  tool: string;
} {
  const dotIndex = namespacedName.indexOf(".");
  if (dotIndex === -1) {
    return { server: "unknown", tool: namespacedName };
  }

  return {
    server: namespacedName.slice(0, dotIndex),
    tool: namespacedName.slice(dotIndex + 1),
  };
}
