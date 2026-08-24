import useSWR from "swr";
import { fetchGroups } from "../../api/torii-client.js";

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
