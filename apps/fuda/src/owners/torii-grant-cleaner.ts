import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";
import type { OwnerGrantCleaner } from "./delete-owner.js";

/**
 * Asks Torii to drop user-OAuth tokens and pending links for an owner.
 * Fuda presents the shared BFF service token; Torii's management gate
 * already accepts that credential.
 */
export function createToriiGrantCleaner(options: {
  toriiBaseUrl: string;
  authorization: string | null;
}): OwnerGrantCleaner {
  const baseUrl = options.toriiBaseUrl.replace(/\/$/, "");
  return {
    async wipe(ownerId) {
      const response = await fetch(
        `${baseUrl}/api/oauth/grants/${encodeURIComponent(ownerId)}`,
        {
          method: "DELETE",
          headers: options.authorization
            ? { authorization: options.authorization }
            : {},
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Torii grant wipe failed (${response.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const body = (await response.json()) as {
        tokensDeleted?: number;
        pendingLinksDeleted?: number;
      };
      return {
        tokensDeleted: body.tokensDeleted ?? 0,
        pendingLinksDeleted: body.pendingLinksDeleted ?? 0,
      };
    },
  };
}

export function toriiGrantCleanerAuthorization(
  serviceToken: string | null,
): string | null {
  return serviceToken ? bffServiceTokenAuthorizationHeader(serviceToken) : null;
}
