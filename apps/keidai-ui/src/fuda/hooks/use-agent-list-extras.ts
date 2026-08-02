import useSWR from "swr";
import { fetchAgentGrants, fetchPersonaVersions } from "../api/fuda-client.js";

export interface AgentListExtra {
  bearerCount: number;
  /** `createdAt` of the agent's current persona version, when known. */
  currentPersonaCreatedAt: string | null;
}

const swrOptions = { onError: () => undefined } as const;

/**
 * Per-agent bearer count + current persona date for the list table. Fuda has
 * no bulk endpoint for either, so this fans out one request per agent — fine
 * at v0 scale.
 */
export function useAgentListExtras(agentIds: readonly string[]) {
  const sortedIds = [...agentIds].sort();
  const key = sortedIds.length > 0 ? ["agent-list-extras", ...sortedIds] : null;

  const { data, error, isLoading } = useSWR(
    key,
    async () => {
      const entries = await Promise.all(
        agentIds.map(async (agentId): Promise<[string, AgentListExtra]> => {
          const [grants, personas] = await Promise.all([
            fetchAgentGrants(agentId).catch(() => ({ grants: [] })),
            fetchPersonaVersions(agentId).catch(() => ({ personas: [] })),
          ]);
          return [
            agentId,
            {
              bearerCount: grants.grants.length,
              currentPersonaCreatedAt: personas.personas[0]?.createdAt ?? null,
            },
          ];
        }),
      );
      return new Map(entries);
    },
    swrOptions,
  );

  return {
    extras: data ?? new Map<string, AgentListExtra>(),
    isLoading,
    error,
  };
}
