import { isOperatorAllowed, resolveOperatorOwnerId } from "./allowlist.js";
import {
  isGoogleIssuer,
  oidcIssuer,
  type OidcIdentityClaims,
} from "./google-oidc.js";
import type { OperatorAuthConfig, ProvisionOwnerRequest } from "./types.js";
import type { OperatorEntry, OperatorRole } from "@keidai/shared";

export type LoginOwnerResolution =
  | {
      ok: true;
      ownerId: string;
      role: OperatorRole;
      email: string;
      name?: string;
      picture?: string;
    }
  | { ok: false; reason: "forbidden" | "disabled" };

function emailDomain(email: string): string {
  return email.split("@")[1]?.trim().toLowerCase() ?? "";
}

function matchingOperator(
  operators: readonly OperatorEntry[],
  claims: OidcIdentityClaims,
): OperatorEntry | undefined {
  const bySub = operators.find(
    (entry) => entry.google_sub && entry.google_sub === claims.googleSub,
  );
  if (bySub) {
    return bySub;
  }
  const email = claims.email.trim().toLowerCase();
  return operators.find(
    (entry) => entry.google_email && entry.google_email === email,
  );
}

/**
 * Domain allowlist, then either JIT provisioning or the operators.yaml map.
 * A non-empty operators list is an allowlist: accounts outside it are rejected
 * before a new owner is created.
 */
export async function resolveLoginOwner(
  config: OperatorAuthConfig,
  claims: OidcIdentityClaims,
): Promise<LoginOwnerResolution> {
  const domains = config.allowedEmailDomains ?? [];
  if (domains.length > 0) {
    const domain = emailDomain(claims.email);
    if (!domain || !domains.includes(domain)) {
      return { ok: false, reason: "forbidden" };
    }
    if (isGoogleIssuer(oidcIssuer(config))) {
      const hd = claims.hd?.trim().toLowerCase();
      if (!hd || !domains.includes(hd)) {
        return { ok: false, reason: "forbidden" };
      }
    }
  }

  const allowlistConfigured = config.operators.length > 0;
  if (allowlistConfigured && !isOperatorAllowed(config.operators, claims)) {
    return { ok: false, reason: "forbidden" };
  }

  if (config.provisionOwner) {
    const hinted = allowlistConfigured
      ? resolveOperatorOwnerId(config.operators, claims)
      : null;
    const hintedRole = matchingOperator(config.operators, claims)?.role;
    const request: ProvisionOwnerRequest = {
      idpIssuer: oidcIssuer(config),
      idpSub: claims.googleSub,
      email: claims.email,
      ...(claims.name ? { displayName: claims.name } : {}),
      ...(claims.picture ? { pictureUrl: claims.picture } : {}),
      ...(hinted ? { ownerId: hinted } : {}),
      ...(hintedRole ? { role: hintedRole } : {}),
    };
    const provisioned = await config.provisionOwner(request);
    if (!provisioned.ok) {
      return { ok: false, reason: "disabled" };
    }
    return {
      ok: true,
      ownerId: provisioned.ownerId,
      role: provisioned.role ?? hintedRole ?? "member",
      email: claims.email,
      ...(claims.name ? { name: claims.name } : {}),
      ...(claims.picture ? { picture: claims.picture } : {}),
    };
  }

  const ownerId = resolveOperatorOwnerId(config.operators, claims);
  if (!ownerId) {
    return { ok: false, reason: "forbidden" };
  }
  return {
    ok: true,
    ownerId,
    role: matchingOperator(config.operators, claims)?.role ?? "member",
    email: claims.email,
    ...(claims.name ? { name: claims.name } : {}),
    ...(claims.picture ? { picture: claims.picture } : {}),
  };
}
