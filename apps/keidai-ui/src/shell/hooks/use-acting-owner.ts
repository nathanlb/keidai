import { useMemo } from "react";
import useSWR from "swr";
import { fetchAgents } from "../api/gateway-client.js";

export const AGENTS_KEY = "agents";

export interface ActingOwner {
  ownerId: string;
  initials: string;
}

function deriveInitials(ownerId: string): string {
  const parts = ownerId
    .split(/[-_]/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }

  return ownerId.slice(0, 2).toUpperCase();
}

const fallbackOwner: ActingOwner = {
  ownerId: "unknown",
  initials: "??",
};

function deriveActingOwner(
  agents: Awaited<ReturnType<typeof fetchAgents>> | undefined,
): ActingOwner {
  const ownerId = agents?.agents[0]?.owner_id;
  if (!ownerId) {
    return fallbackOwner;
  }

  return {
    ownerId,
    initials: deriveInitials(ownerId),
  };
}

export function useActingOwner() {
  const { data, mutate, isLoading } = useSWR(AGENTS_KEY, fetchAgents, {
    onError: () => undefined,
  });

  const owner = useMemo(() => deriveActingOwner(data), [data]);

  return { owner, refresh: mutate, isLoading };
}
