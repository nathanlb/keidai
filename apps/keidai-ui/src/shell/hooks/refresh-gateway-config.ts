import { useSWRConfig } from "swr";
import { TRACE_STATS_KEY } from "./use-fetch-trace-stats.js";
import { AGENTS_KEY } from "./use-fetch-agents.js";
import { isOAuthConnectionsKey } from "./use-fetch-oauth-connections.js";
import { OAUTH_PROVIDERS_KEY } from "./use-fetch-oauth-providers.js";
import { SERVERS_KEY } from "./use-fetch-servers.js";
import { TORII_STATUS_KEY, SHAIDEN_STATUS_KEY } from "./backend-health.js";
import { RUNS_KEY } from "./use-runs.js";

type SwrMutate = ReturnType<typeof useSWRConfig>["mutate"];

const revalidate = { revalidate: true } as const;

export function refreshGatewayConfig(mutate: SwrMutate): void {
  void mutate(TORII_STATUS_KEY, undefined, revalidate);
  void mutate(SHAIDEN_STATUS_KEY, undefined, revalidate);
  void mutate(AGENTS_KEY, undefined, revalidate);
  void mutate(SERVERS_KEY, undefined, revalidate);
  void mutate(OAUTH_PROVIDERS_KEY, undefined, revalidate);
  void mutate(isOAuthConnectionsKey, undefined, revalidate);
  void mutate(TRACE_STATS_KEY, undefined, revalidate);
  void mutate(RUNS_KEY, undefined, revalidate);
}
