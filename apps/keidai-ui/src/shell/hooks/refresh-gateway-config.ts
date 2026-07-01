import { AGENTS_KEY } from "./use-fetch-agents.js";
import { isOAuthConnectionsKey } from "./use-fetch-oauth-connections.js";
import { OAUTH_PROVIDERS_KEY } from "./use-fetch-oauth-providers.js";
import { SERVERS_KEY } from "./use-fetch-servers.js";
import { GATEWAY_STATUS_KEY } from "./use-gateway-status.js";

type GlobalMutate = (
  key: unknown,
  data?: unknown,
  options?: { revalidate?: boolean },
) => Promise<unknown>;

const revalidate = { revalidate: true } as const;

export function refreshGatewayConfig(mutate: GlobalMutate): void {
  void mutate(GATEWAY_STATUS_KEY, undefined, revalidate);
  void mutate(AGENTS_KEY, undefined, revalidate);
  void mutate(SERVERS_KEY, undefined, revalidate);
  void mutate(OAUTH_PROVIDERS_KEY, undefined, revalidate);
  void mutate(isOAuthConnectionsKey, undefined, revalidate);
}
