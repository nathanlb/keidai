/**
 * Resolves a display-only backend address from a Vite env var.
 * Returns a clear sentinel when unset so missing config is obvious in the UI.
 */
export function resolveBackendDisplayAddress(
  envName: string,
  value: string | undefined,
): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return `${envName} unset`;
  }

  try {
    const parsed = new URL(trimmed);
    return `${parsed.hostname}:${parsed.port || (parsed.protocol === "https:" ? "443" : "80")}`;
  } catch {
    return `${envName} invalid`;
  }
}
