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

export async function fetchManagementApiJson<T>(
  upstream: string,
  path: string,
  options: { bffServiceToken: string | null },
): Promise<T> {
  const url = `${upstream}${path}`;
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (options.bffServiceToken) {
    headers.authorization = bffServiceTokenAuthorizationHeader(
      options.bffServiceToken,
    );
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new UpstreamRequestError(upstream, response.status);
  }

  return (await response.json()) as T;
}
