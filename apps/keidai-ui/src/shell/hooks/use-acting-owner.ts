import { useMemo } from "react";
import { deriveOwnerInitials } from "../utils/derive-owner-initials.js";
import { useOperatorSession } from "./use-operator-session.js";

export interface ActingOwner {
  ownerId: string;
  /** Display label — Google name/email when authenticated. */
  displayName: string;
  initials: string;
  picture?: string;
}

/**
 * Acting owner for operator UI writes (agent create, OAuth link).
 *
 * Always session-derived (`GET /api/session`). Without an authenticated
 * principal there is no acting owner — the shell must send the operator
 * through Google OIDC again.
 */
export function useActingOwner() {
  const { status, principal } = useOperatorSession();

  const owner = useMemo((): ActingOwner | null => {
    if (status !== "authenticated" || !principal) {
      return null;
    }

    const displayName =
      principal.name?.trim() || principal.email.trim() || principal.ownerId;
    return {
      ownerId: principal.ownerId,
      displayName,
      initials: deriveOwnerInitials(
        principal.name?.trim() || principal.email || principal.ownerId,
      ),
      ...(principal.picture ? { picture: principal.picture } : {}),
    };
  }, [status, principal]);

  return {
    owner,
    isLoading: status === "loading",
  };
}
