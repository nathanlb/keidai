import useSWR from "swr";
import { fetchAgent } from "../api/fuda-client.js";

export function agentKey(agentId: string): string {
  return `agent:${agentId}`;
}

const swrOptions = { onError: () => undefined } as const;

export function useFetchAgent(agentId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    agentId ? agentKey(agentId) : null,
    () => fetchAgent(agentId as string),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
