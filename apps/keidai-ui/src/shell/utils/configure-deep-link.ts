import { resolveNavMode } from "../navigation.js";

export const CONFIGURE_RETURN_PARAM = "return";
export const CONFIGURE_FIX_PARAM = "fix";

export interface ConfigureDeepLink {
  returnTo?: string;
  fix?: string;
}

function pathnameOf(href: string): string {
  return href.split("#")[0]?.split("?")[0] ?? href;
}

export function sanitizeReturnTo(
  raw: string | null | undefined,
): string | undefined {
  if (!raw) {
    return undefined;
  }

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return undefined;
  }
  if (trimmed.includes("://")) {
    return undefined;
  }
  if (resolveNavMode(pathnameOf(trimmed)) === "configure") {
    return undefined;
  }

  return trimmed;
}

export function parseConfigureDeepLink(
  searchParams: URLSearchParams,
): ConfigureDeepLink {
  const returnTo = sanitizeReturnTo(searchParams.get(CONFIGURE_RETURN_PARAM));
  const fix = searchParams.get(CONFIGURE_FIX_PARAM)?.trim() || undefined;
  return { returnTo, fix };
}

export function titleCaseIdentifier(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildConfigureHref(options?: {
  path?: string;
  returnTo?: string;
  fix?: string;
}): string {
  const path = options?.path ?? "/configure/connections";
  const params = new URLSearchParams();
  const returnTo = sanitizeReturnTo(options?.returnTo);
  if (returnTo) {
    params.set(CONFIGURE_RETURN_PARAM, returnTo);
  }
  if (options?.fix) {
    params.set(CONFIGURE_FIX_PARAM, options.fix);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}
