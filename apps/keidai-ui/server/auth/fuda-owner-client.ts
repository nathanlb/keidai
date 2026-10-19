import { operatorContextHeaders, type OperatorRole } from "@keidai/shared";
import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";
import type { ProvisionOwnerRequest, ProvisionOwnerResult } from "./types.js";

const DEFAULT_OWNER_ACTIVE_CACHE_TTL_MS = 5_000;

export interface OwnerAccess {
  active: boolean;
  role: OperatorRole;
}

function roleFromOwner(role: unknown): OperatorRole {
  return role === "admin" ? "admin" : "member";
}

export function createFudaOwnerClient(options: {
  fudaBaseUrl: string;
  serviceToken: string | null;
  cacheTtlMs?: number;
}): {
  provisionOwner: (
    input: ProvisionOwnerRequest,
  ) => Promise<ProvisionOwnerResult>;
  getOwnerAccess: (ownerId: string) => Promise<OwnerAccess>;
  isOwnerActive: (ownerId: string) => Promise<boolean>;
} {
  const baseUrl = options.fudaBaseUrl.replace(/\/$/, "");
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_OWNER_ACTIVE_CACHE_TTL_MS;
  const accessCache = new Map<
    string,
    { access: OwnerAccess; expiresAt: number }
  >();
  const inflightAccess = new Map<string, Promise<OwnerAccess>>();
  const headers: Record<string, string> = options.serviceToken
    ? {
        authorization: bffServiceTokenAuthorizationHeader(options.serviceToken),
      }
    : {};

  function rememberAccess(ownerId: string, access: OwnerAccess): void {
    if (cacheTtlMs <= 0) {
      return;
    }
    accessCache.set(ownerId, {
      access,
      expiresAt: Date.now() + cacheTtlMs,
    });
  }

  async function fetchOwnerAccess(ownerId: string): Promise<OwnerAccess> {
    // Role refresh runs before the caller can be classified. This lookup is
    // the BFF itself, so it presents as an admin. Browser calls still arrive
    // with the session role, which AdminOnly enforces.
    const response = await fetch(
      `${baseUrl}/api/owners/${encodeURIComponent(ownerId)}`,
      {
        headers: {
          ...headers,
          ...operatorContextHeaders({ ownerId: "keidai-bff", role: "admin" }),
        },
      },
    );
    if (response.status === 404) {
      const missing: OwnerAccess = { active: false, role: "member" };
      rememberAccess(ownerId, missing);
      return missing;
    }
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Fuda owner lookup failed (${response.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    const body = (await response.json()) as {
      owner?: { status?: string; role?: string };
    };
    const access: OwnerAccess = {
      active: body.owner?.status === "active",
      role: roleFromOwner(body.owner?.role),
    };
    rememberAccess(ownerId, access);
    return access;
  }

  async function loadOwnerAccess(ownerId: string): Promise<OwnerAccess> {
    if (cacheTtlMs > 0) {
      const cached = accessCache.get(ownerId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.access;
      }
    }
    const existing = inflightAccess.get(ownerId);
    if (existing) {
      return existing;
    }
    const pending = fetchOwnerAccess(ownerId).finally(() => {
      inflightAccess.delete(ownerId);
    });
    inflightAccess.set(ownerId, pending);
    return pending;
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
          rememberAccess(body.ownerId, { active: false, role: "member" });
        }
        return { ok: false, reason: "disabled" };
      }
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `Fuda owner provision failed (${response.status})${detail ? `: ${detail}` : ""}`,
        );
      }
      const body = (await response.json()) as {
        owner?: { ownerId?: string; role?: string };
      };
      const ownerId = body.owner?.ownerId;
      if (!ownerId) {
        throw new Error("Fuda owner provision returned no ownerId");
      }
      const role = roleFromOwner(body.owner?.role);
      rememberAccess(ownerId, { active: true, role });
      return { ok: true, ownerId, role };
    },

    getOwnerAccess: loadOwnerAccess,

    async isOwnerActive(ownerId) {
      return (await loadOwnerAccess(ownerId)).active;
    },
  };
}
