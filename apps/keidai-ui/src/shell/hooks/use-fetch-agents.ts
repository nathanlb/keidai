import useSWR from "swr";
import { fetchAgents } from "../api/gateway-client.js";

export const AGENTS_KEY = "agents";

const swrOptions = { onError: () => undefined } as const;

export function useFetchAgents() {
  const { data, error, isLoading, mutate } = useSWR(
    AGENTS_KEY,
    fetchAgents,
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
