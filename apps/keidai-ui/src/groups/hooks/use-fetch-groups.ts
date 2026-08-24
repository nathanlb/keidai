import useSWR from "swr";
import { fetchGroups } from "../../lib/api/gateway.js";

export const GROUPS_KEY = "torii-group-policies";

const swrOptions = { onError: () => undefined } as const;

export function useFetchGroups() {
  const { data, error, isLoading, mutate } = useSWR(
    GROUPS_KEY,
    fetchGroups,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
