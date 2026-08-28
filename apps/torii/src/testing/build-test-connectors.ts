import type { ConnectorAuthMode, ConnectorRecord } from "@keidai/shared";

export type TestConnectorInput = Partial<ConnectorRecord> &
  Pick<ConnectorRecord, "slug" | "url">;

/**
 * Compact connector fixtures for tests that talk to ConnectorRegistry
 * directly. Most existing tests still pass a ToriiConfig literal into
 * ToriiConfigService, which synthesizes the same shape.
 */
export function buildTestConnectors(
  entries: readonly TestConnectorInput[],
): ConnectorRecord[] {
  const now = new Date(0).toISOString();
  return entries.map((entry) => {
    const authMode: ConnectorAuthMode = entry.authMode ?? "none";
    return {
      displayName: entry.displayName ?? entry.slug,
      transportType: "http",
      authMode,
      enabled: entry.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      ...entry,
    };
  });
}
