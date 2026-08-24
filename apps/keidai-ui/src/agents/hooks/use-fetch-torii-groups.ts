import useSWR from "swr";
import { fetchToriiGroups } from "../../lib/api/gateway.js";

export const TORII_GROUPS_KEY = "torii-groups";

const swrOptions = { onError: () => undefined } as const;

/** Soft join only — an empty list means every group renders as unknown. */
export function useFetchToriiGroups() {
  const { data, error, isLoading, mutate } = useSWR(
    TORII_GROUPS_KEY,
    fetchToriiGroups,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
