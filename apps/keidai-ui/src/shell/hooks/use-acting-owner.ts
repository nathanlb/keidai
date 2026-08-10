import { useMemo } from "react";
import { deriveOwnerInitials } from "../utils/derive-owner-initials.js";
import { useFetchAgents } from "./use-fetch-agents.js";
import { useOperatorSession } from "./use-operator-session.js";

export interface ActingOwner {
  ownerId: string;
  /** Display label — Google name/email when authenticated, else ownerId. */
  displayName: string;
  initials: string;
  picture?: string;
}

/**
 * Last-resort owner when `/api/session` is unavailable (Vite → Torii) and no
 * agents are loaded yet. Aligns with demo operators.yaml / Fuda seed.
 */
const V0_FALLBACK_OWNER_ID = "demo-owner";

/**
 * Acting owner for operator UI writes (agent create, OAuth link).
 *
 * Prefer the BFF session `ownerId` + IdP display fields. When the session
 * endpoint is missing (local Vite without BFF), fall back to the first
 * loaded agent or the demo seed owner.
 */
export function useActingOwner() {
  const { status, principal } = useOperatorSession();
  const { data, refresh, isLoading } = useFetchAgents();

  const owner = useMemo((): ActingOwner => {
    if (status === "authenticated" && principal) {
      const displayName =
        principal.name?.trim() ||
        principal.email.trim() ||
        principal.ownerId;
      return {
        ownerId: principal.ownerId,
        displayName,
        initials: deriveOwnerInitials(
          principal.name?.trim() || principal.email || principal.ownerId,
        ),
        ...(principal.picture ? { picture: principal.picture } : {}),
      };
    }

    const ownerId = data?.agents[0]?.ownerId ?? V0_FALLBACK_OWNER_ID;
    return {
      ownerId,
      displayName: ownerId,
      initials: deriveOwnerInitials(ownerId),
    };
  }, [status, principal, data]);

  return {
    owner,
    refresh,
    isLoading: status === "loading" || isLoading,
  };
}
