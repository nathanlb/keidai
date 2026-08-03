import type { ToriiConfig } from "@keidai/shared";

/**
 * Resolves the owner id for OAuth link/read flows.
 * Explicit `?owner=` wins; otherwise falls back to deployment `boot_owner_id`.
 */
export function resolveOAuthOwnerId(
  config: ToriiConfig,
  ownerIdFlag: string | undefined,
): string {
  if (ownerIdFlag) {
    return ownerIdFlag;
  }

  return config.boot_owner_id;
}
