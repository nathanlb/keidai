import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";
import type { ProvisionOwnerRequest, ProvisionOwnerResult } from "./types.js";

const DEFAULT_OWNER_ACTIVE_CACHE_TTL_MS = 5_000;

export function createFudaOwnerClient(options: {
  fudaBaseUrl: string;
  serviceToken: string | null;
  cacheTtlMs?: number;
}): {
  provisionOwner: (
    input: ProvisionOwnerRequest,
  ) => Promise<ProvisionOwnerResult>;
  isOwnerActive: (ownerId: string) => Promise<boolean>;
} {
  const baseUrl = options.fudaBaseUrl.replace(/\/$/, "");
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_OWNER_ACTIVE_CACHE_TTL_MS;
  const activeCache = new Map<string, { active: boolean; expiresAt: number }>();
  const inflightActive = new Map<string, Promise<boolean>>();
  const headers: Record<string, string> = options.serviceToken
    ? {
        authorization: bffServiceTokenAuthorizationHeader(options.serviceToken),
      }
    : {};

  function rememberActive(ownerId: string, active: boolean): void {
    if (cacheTtlMs <= 0) {
      return;
    }
    activeCache.set(ownerId, {
      active,
      expiresAt: Date.now() + cacheTtlMs,
    });
  }

  async function fetchOwnerActive(ownerId: string): Promise<boolean> {
    const response = await fetch(
      `${baseUrl}/api/owners/${encodeURIComponent(ownerId)}`,
      { headers },
    );
    if (response.status === 404) {
      rememberActive(ownerId, false);
      return false;
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Fuda owner lookup failed (${response.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    const body = (await response.json()) as { owner?: { status?: string } };
    const active = body.owner?.status === "active";
    rememberActive(ownerId, active);
    return active;
  }

  return {
    async provisionOwner(input) {
      const response = await fetch(
        `${baseUrl}/api/owners/resolve-or-provision`,
        {
          method: "POST",
          headers: {
            ...headers,
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        },
      );
      if (response.status === 403) {
        const body = (await response.json().catch(() => null)) as {
          ownerId?: string;
        } | null;
        if (body?.ownerId) {
          rememberActive(body.ownerId, false);
        }
        return { ok: false, reason: "disabled" };
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Fuda owner provision failed (${response.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const body = (await response.json()) as { owner?: { ownerId?: string } };
      const ownerId = body.owner?.ownerId;
      if (!ownerId) {
        throw new Error("Fuda owner provision returned no ownerId");
      }
      rememberActive(ownerId, true);
      return { ok: true, ownerId };
    },

    async isOwnerActive(ownerId) {
      if (cacheTtlMs > 0) {
        const cached = activeCache.get(ownerId);
        if (cached && cached.expiresAt > Date.now()) {
          return cached.active;
        }
      }
      const existing = inflightActive.get(ownerId);
      if (existing) {
        return existing;
      }
      const pending = fetchOwnerActive(ownerId).finally(() => {
        inflightActive.delete(ownerId);
      });
      inflightActive.set(ownerId, pending);
      return pending;
    },
  };
}
