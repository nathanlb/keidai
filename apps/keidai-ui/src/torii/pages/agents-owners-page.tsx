import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import { useFetchServers } from "../../shell/hooks/use-fetch-servers.js";
import { AgentsOwnersView } from "../agents/agents-owners-view.js";
import { groupAgentsByOwner } from "../agents/utils/group-agents-by-owner.js";

export function AgentsOwnersPage() {
  const {
    data: agentsData,
    error: agentsError,
    isLoading: agentsLoading,
  } = useFetchAgents();

  const {
    data: serversData,
    error: serversError,
    isLoading: serversLoading,
  } = useFetchServers();

  const isLoading = agentsLoading || serversLoading;
  const error = agentsError ?? serversError;

  if (isLoading && !agentsData && !serversData) {
    return (
      <p className="text-sm text-muted-foreground">Loading agents…</p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load agent configuration from the gateway.
      </p>
    );
  }

  const groups = groupAgentsByOwner(agentsData?.agents ?? []);
  const serverNames = (serversData?.servers ?? [])
    .map((server) => server.name)
    .sort((left, right) => left.localeCompare(right));

  return <AgentsOwnersView groups={groups} serverNames={serverNames} />;
}
