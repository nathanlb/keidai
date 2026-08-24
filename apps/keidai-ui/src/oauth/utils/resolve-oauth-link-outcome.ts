import type { OAuthConnectionStatus, OAuthLinkStatus } from "@keidai/shared";

export type OAuthLinkPollOutcome =
  | { kind: "pending" }
  | { kind: "linked" }
  | { kind: "failed"; error: string };

export interface OAuthLinkSessionContext {
  statusAtStart: OAuthLinkStatus;
  sawPending: boolean;
}

export function resolveOAuthLinkOutcome(
  connections: OAuthConnectionStatus[],
  providerId: string,
): OAuthLinkPollOutcome {
  const connection = connections.find((entry) => entry.provider === providerId);
  if (!connection) {
    return { kind: "pending" };
  }

  switch (connection.status) {
    case "linked":
      return { kind: "linked" };
    case "failed":
      return {
        kind: "failed",
        error: connection.error ?? "Authorization failed",
      };
    case "pending":
    case "expired":
    case "not_linked":
      return { kind: "pending" };
  }
}

export function shouldAcceptLinkedOutcome(
  outcome: OAuthLinkPollOutcome,
  session: OAuthLinkSessionContext,
): boolean {
  if (outcome.kind !== "linked") {
    return false;
  }

  if (session.statusAtStart === "linked" && !session.sawPending) {
    return false;
  }

  return true;
}

export function connectionStatusForProvider(
  connections: OAuthConnectionStatus[],
  providerId: string,
): OAuthLinkStatus {
  return (
    connections.find((entry) => entry.provider === providerId)?.status ??
    "not_linked"
  );
}
