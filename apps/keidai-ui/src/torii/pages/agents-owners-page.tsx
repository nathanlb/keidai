import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import { AgentsOwnersView } from "../agents/agents-owners-view.js";
import { groupAgentsByOwner } from "../agents/utils/group-agents-by-owner.js";

export function AgentsOwnersPage() {
  const {
    data: agentsData,
    error: agentsError,
    isLoading: agentsLoading,
  } = useFetchAgents();

  const isLoading = agentsLoading;
  const error = agentsError;

  if (isLoading && !agentsData) {
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

  return <AgentsOwnersView groups={groups} />;
}
