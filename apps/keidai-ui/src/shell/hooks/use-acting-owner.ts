import { useMemo } from "react";
import { deriveOwnerInitials } from "../utils/derive-owner-initials.js";
import { useFetchAgents } from "./use-fetch-agents.js";

export interface ActingOwner {
  ownerId: string;
  initials: string;
}

/** v0 has one implicit owner and no user auth. */
const V0_FALLBACK_OWNER_ID = "nathanlb";

export function useActingOwner() {
  const { data, refresh, isLoading } = useFetchAgents();

  const owner = useMemo((): ActingOwner => {
    const ownerId = data?.agents[0]?.ownerId ?? V0_FALLBACK_OWNER_ID;

    return {
      ownerId,
      initials: deriveOwnerInitials(ownerId),
    };
  }, [data]);

  return { owner, refresh, isLoading };
}
