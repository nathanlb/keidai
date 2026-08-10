import useSWR from "swr";
import type { OperatorPrincipal } from "@keidai/shared";

const OPERATOR_AUTH_UNAVAILABLE = "OperatorAuthUnavailable";

export type OperatorSessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "unavailable";

export interface OperatorSessionState {
  status: OperatorSessionStatus;
  principal: OperatorPrincipal | null;
  error: string | null;
  refresh: () => Promise<OperatorPrincipal | null | undefined>;
}

async function fetchOperatorSession(
  url: string,
): Promise<OperatorPrincipal | null> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { accept: "application/json" },
  });

  if (response.status === 401) {
    return null;
  }

  // Vite alone (no BFF) may 404 /api/session — treat as auth unavailable so
  // the shell requires Google OIDC via the BFF.
  if (response.status === 404) {
    const error = new Error(OPERATOR_AUTH_UNAVAILABLE);
    error.name = OPERATOR_AUTH_UNAVAILABLE;
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Session request failed (${response.status})`);
  }

  return (await response.json()) as OperatorPrincipal;
}

/**
 * Reads the BFF operator session. When the session endpoint is missing
 * (e.g. Vite alone without the API-only BFF), status is `unavailable` and the
 * shell requires Google OIDC login.
 */
export function useOperatorSession(): OperatorSessionState {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/session",
    fetchOperatorSession,
    {
      shouldRetryOnError: false,
      revalidateOnFocus: true,
    },
  );

  if (error?.name === OPERATOR_AUTH_UNAVAILABLE) {
    return {
      status: "unavailable",
      principal: null,
      error: null,
      refresh: mutate,
    };
  }

  if (isLoading && data === undefined && !error) {
    return {
      status: "loading",
      principal: null,
      error: null,
      refresh: mutate,
    };
  }

  if (error) {
    return {
      status: "unauthenticated",
      principal: null,
      error: error instanceof Error ? error.message : "Session error",
      refresh: mutate,
    };
  }

  if (data) {
    return {
      status: "authenticated",
      principal: data,
      error: null,
      refresh: mutate,
    };
  }

  return {
    status: "unauthenticated",
    principal: null,
    error: null,
    refresh: mutate,
  };
}
