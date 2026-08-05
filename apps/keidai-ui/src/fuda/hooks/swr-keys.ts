/** Shared SWR key helpers for bearer/agent grant cache invalidation. */

export function bearerDetailKey(bearerId: string): string {
  return `bearer:${bearerId}`;
}

export function isBearerListExtrasKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === "bearer-list-extras";
}

export function isAgentListExtrasKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === "agent-list-extras";
}
