import type { IncomingHttpHeaders } from "node:http";

export function parseCookieHeader(
  cookieHeader: string | undefined,
): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(value));
    } catch {
      // Malformed %-encoding — skip rather than throwing in the auth gate.
    }
  }

  return cookies;
}

export function readCookie(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const header = headers.cookie;
  if (typeof header !== "string") {
    return undefined;
  }
  return parseCookieHeader(header).get(name);
}

export interface SetCookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  path?: string;
  maxAgeSeconds?: number;
  /** When true, emits an expired cookie that clears the name. */
  clear?: boolean;
}

export function serializeCookie(
  name: string,
  value: string,
  options: SetCookieOptions = {},
): string {
  const parts = [
    `${name}=${options.clear ? "" : encodeURIComponent(value)}`,
  ];

  parts.push(`Path=${options.path ?? "/"}`);

  if (options.clear) {
    parts.push("Max-Age=0");
  } else if (options.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${options.maxAgeSeconds}`);
  }

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);

  return parts.join("; ");
}
