import type { IncomingHttpHeaders } from "node:http";
import {
  operatorContextHeaders,
  stripOperatorContextHeaders,
  type OperatorContext,
} from "@keidai/shared";
import { bffServiceTokenAuthorizationHeader } from "@keidai/shared/bff-service-token";

export class UpstreamRequestError extends Error {
  readonly status: number;
  readonly upstream: string;

  constructor(upstream: string, status: number, message?: string) {
    super(message ?? `${upstream} request failed: ${status}`);
    this.name = "UpstreamRequestError";
    this.upstream = upstream;
    this.status = status;
  }
}

export interface FetchManagementApiOptions {
  bffServiceToken: string | null;
  /** Authenticated operator. Injected after client operator headers are stripped. */
  operator?: OperatorContext | null;
  /** Extra headers. `x-keidai-operator-*` values are removed before the request. */
  headers?: IncomingHttpHeaders;
}

export async function fetchManagementApiJson<T>(
  upstream: string,
  path: string,
  options: FetchManagementApiOptions,
): Promise<T> {
  const url = `${upstream}${path}`;
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (options.headers) {
    const stripped = stripOperatorContextHeaders(options.headers);
    for (const [key, value] of Object.entries(stripped)) {
      if (typeof value !== "string") {
        continue;
      }
      const lower = key.toLowerCase();
      if (
        lower === "authorization" ||
        lower === "host" ||
        lower === "accept" ||
        lower === "content-length"
      ) {
        continue;
      }
      headers[lower] = value;
    }
  }

  if (options.bffServiceToken) {
    headers.authorization = bffServiceTokenAuthorizationHeader(
      options.bffServiceToken,
    );
  }

  if (options.operator) {
    Object.assign(headers, operatorContextHeaders(options.operator));
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new UpstreamRequestError(upstream, response.status);
  }

  return (await response.json()) as T;
}
