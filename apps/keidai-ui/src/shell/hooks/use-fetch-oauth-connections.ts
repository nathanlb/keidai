import type { OAuthConnectionStatus } from "@keidai/shared";
import { useCallback } from "react";
import useSWR from "swr";
import { fetchOAuthConnections } from "../api/gateway-client.js";

export const OAUTH_CONNECTIONS_KEY_PREFIX = "oauth-connections";

const swrOptions = { onError: () => undefined } as const;

export function oauthConnectionsKey(ownerIds: readonly string[]): string[] | null {
  if (ownerIds.length === 0) {
    return null;
  }

  return [OAUTH_CONNECTIONS_KEY_PREFIX, ...[...ownerIds].sort()];
}

export function isOAuthConnectionsKey(key: unknown): boolean {
  return Array.isArray(key) && key[0] === OAUTH_CONNECTIONS_KEY_PREFIX;
}

async function fetchConnectionsByOwner(
  ownerIds: readonly string[],
): Promise<Map<string, OAuthConnectionStatus[]>> {
  const entries = await Promise.all(
    ownerIds.map(async (ownerId) => {
      const response = await fetchOAuthConnections(ownerId);
      return [ownerId, response.connections] as const;
    }),
  );

  return new Map(entries);
}

export function useFetchOAuthConnections(ownerIds: readonly string[]) {
  const { data, error, isLoading, mutate } = useSWR(
    oauthConnectionsKey(ownerIds),
    () => fetchConnectionsByOwner(ownerIds),
    swrOptions,
  );

  const refresh = useCallback(
    () => mutate(undefined, { revalidate: true }),
    [mutate],
  );

  const patchOwnerConnections = useCallback(
    async (ownerId: string, connections: OAuthConnectionStatus[]) => {
      await mutate(
        (current) => {
          const next = new Map(current ?? []);
          next.set(ownerId, connections);
          return next;
        },
        { revalidate: false },
      );
    },
    [mutate],
  );

  return { data, error, isLoading, refresh, patchOwnerConnections };
}
