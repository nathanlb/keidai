import useSWR from "swr";
import { fetchAgentGrants } from "../../lib/api/agents.js";

export function agentGrantsKey(agentId: string): string {
  return `agent-grants:${agentId}`;
}

const swrOptions = { onError: () => undefined } as const;

export function useFetchAgentGrants(agentId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    agentId ? agentGrantsKey(agentId) : null,
    () => fetchAgentGrants(agentId as string),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
