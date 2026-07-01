import { useMemo } from "react";
import { deriveOwnerInitials } from "../utils/derive-owner-initials.js";
import { useFetchAgents } from "./use-fetch-agents.js";

export interface ActingOwner {
  ownerId: string;
  initials: string;
}

const fallbackOwner: ActingOwner = {
  ownerId: "unknown",
  initials: "??",
};

export function useActingOwner() {
  const { data, refresh, isLoading } = useFetchAgents();

  // This method is temporary for v0 as there is one implicit owner and no form of user auth.
  const owner = useMemo((): ActingOwner => {
    const ownerId = data?.agents[0]?.owner_id;
    if (!ownerId) {
      return fallbackOwner;
    }

    return {
      ownerId,
      initials: deriveOwnerInitials(ownerId),
    };
  }, [data]);

  return { owner, refresh, isLoading };
}
