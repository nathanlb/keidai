import useSWR from "swr";
import { fetchBearer, type Grant } from "../api/fuda-client.js";

export interface BearerListExtra {
  grants: Grant[];
}

const swrOptions = { onError: () => undefined } as const;

/**
 * Per-bearer grants for the list table. Fuda's list endpoint returns bare
 * records, so this fans out one detail request per bearer — fine at v0 scale.
 */
export function useBearerListExtras(bearerIds: readonly string[]) {
  const sortedIds = [...bearerIds].sort();
  const key =
    sortedIds.length > 0 ? ["bearer-list-extras", ...sortedIds] : null;

  const { data, error, isLoading, mutate } = useSWR(
    key,
    async () => {
      const entries = await Promise.all(
        bearerIds.map(async (bearerId): Promise<[string, BearerListExtra]> => {
          const detail = await fetchBearer(bearerId).catch(() => ({
            grants: [] as Grant[],
          }));
          return [bearerId, { grants: detail.grants }];
        }),
      );
      return new Map(entries);
    },
    swrOptions,
  );

  return {
    extras: data ?? new Map<string, BearerListExtra>(),
    isLoading,
    error,
    refresh: mutate,
  };
}
