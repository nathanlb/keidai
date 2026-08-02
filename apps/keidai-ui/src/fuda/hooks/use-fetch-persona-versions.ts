import useSWR from "swr";
import { fetchPersonaVersions } from "../api/fuda-client.js";

export function personaVersionsKey(agentId: string): string {
  return `agent-personas:${agentId}`;
}

const swrOptions = { onError: () => undefined } as const;

export function useFetchPersonaVersions(agentId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    agentId ? personaVersionsKey(agentId) : null,
    () => fetchPersonaVersions(agentId as string),
    swrOptions,
  );

  return { data, error, isLoading, refresh: mutate };
}
