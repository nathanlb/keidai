import type { ServerConfig } from "@torii/shared";

/** Trace-safe credential reference derived from config — no secret material. */
export function deriveCredentialRef(
  server: ServerConfig,
  ownerId?: string,
): string {
  switch (server.credential.strategy) {
    case "none":
      return "none";
    case "service_key":
      return `service_key:${server.name}`;
    case "user_oauth":
      return ownerId
        ? `${server.credential.provider}:${ownerId}`
        : `${server.credential.provider}:unknown`;
  }
}
