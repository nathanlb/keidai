import { useSWRConfig } from "swr";
import { TRACE_STATS_KEY } from "./use-fetch-trace-stats.js";
import { AGENTS_KEY } from "./use-fetch-agents.js";
import { isOAuthConnectionsKey } from "./use-fetch-oauth-connections.js";
import { OAUTH_PROVIDERS_KEY } from "./use-fetch-oauth-providers.js";
import { SERVERS_KEY } from "./use-fetch-servers.js";
import { CONNECTORS_KEY } from "./use-fetch-connectors.js";
import { TORII_STATUS_KEY, SHAIDEN_STATUS_KEY } from "./backend-health.js";
import { FUDA_STATUS_KEY } from "./use-fuda-status.js";
import { TORII_GROUPS_KEY } from "../../agents/hooks/use-fetch-torii-groups.js";
import { GROUPS_KEY } from "../../groups/hooks/use-fetch-groups.js";
import { TASKS_KEY } from "../../tasks/hooks/use-fetch-tasks.js";
import { RUNS_VISIBILITY_KEY } from "../../runs/hooks/use-runs-visibility.js";

type SwrMutate = ReturnType<typeof useSWRConfig>["mutate"];

const revalidate = { revalidate: true } as const;

export function refreshToriiConfig(mutate: SwrMutate): void {
  void mutate(TORII_STATUS_KEY, undefined, revalidate);
  void mutate(SHAIDEN_STATUS_KEY, undefined, revalidate);
  void mutate(FUDA_STATUS_KEY, undefined, revalidate);
  void mutate(AGENTS_KEY, undefined, revalidate);
  void mutate(SERVERS_KEY, undefined, revalidate);
  void mutate(CONNECTORS_KEY, undefined, revalidate);
  void mutate(GROUPS_KEY, undefined, revalidate);
  void mutate(TORII_GROUPS_KEY, undefined, revalidate);
  void mutate(OAUTH_PROVIDERS_KEY, undefined, revalidate);
  void mutate(isOAuthConnectionsKey, undefined, revalidate);
  void mutate(TRACE_STATS_KEY, undefined, revalidate);
  void mutate(TASKS_KEY, undefined, revalidate);
  void mutate(RUNS_VISIBILITY_KEY, undefined, revalidate);
}
