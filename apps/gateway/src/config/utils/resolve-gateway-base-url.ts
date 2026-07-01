import type { FastifyRequest } from "fastify";
import type { ToriiConfig } from "@keidai/shared";

function readRequestBaseUrl(request: FastifyRequest): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol =
    (typeof forwardedProto === "string"
      ? forwardedProto.split(",")[0]?.trim()
      : undefined) ?? "http";
  const host = request.headers.host ?? "127.0.0.1";
  return `${protocol}://${host}`;
}

/** Stable public base URL for gateway-derived OAuth callbacks. */
export function resolveGatewayBaseUrl(
  config: ToriiConfig,
  request?: FastifyRequest,
): string {
  const configured =
    config.gateway_base_url?.trim() ||
    process.env.TORII_GATEWAY_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (request) {
    return readRequestBaseUrl(request);
  }

  const host = process.env.TORII_HOST ?? "127.0.0.1";
  const port = process.env.TORII_PORT ?? process.env.PORT ?? "3100";
  return `http://${host}:${port}`;
}
