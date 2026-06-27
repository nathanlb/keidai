import type { OAuthConnectionStatus } from "@keidai/shared";
import useSWR from "swr";
import { fetchOAuthConnections } from "../api/gateway-client.js";

const swrOptions = { onError: () => undefined } as const;

export function oauthConnectionsKey(ownerIds: readonly string[]): string[] | null {
  if (ownerIds.length === 0) {
    return null;
  }

  return ["oauth-connections", ...[...ownerIds].sort()];
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

  return { data, error, isLoading, refresh: mutate };
}
