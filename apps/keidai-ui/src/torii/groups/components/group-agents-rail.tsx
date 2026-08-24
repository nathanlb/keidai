import { Card, CardContent, cn } from "@keidai/ui";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";
import type { ManagementAgent } from "../../../fuda/api/fuda-client.js";
import { deriveAgentInitials } from "../../../fuda/agents/utils/derive-agent-initials.js";
import { formatOtherGroupsLine } from "../utils/format-groups-copy.js";
import { otherGroupNames } from "../utils/collect-undefined-groups.js";

export function GroupAgentsRail({
  groupName,
  agents,
}: {
  groupName: string;
  agents: readonly ManagementAgent[];
}) {
  const navigate = useNavigate();

  return (
    <Card className="overflow-hidden shadow-none">
      <div className="flex items-center gap-2 border-b border-border px-3.75 py-3">
        <span className="text-[13px] font-semibold">Agents in this group</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {agents.length}
        </span>
      </div>
      <CardContent className="p-0">
        {agents.length === 0 ? (
          <p className="px-3.75 py-3 text-[12.5px] text-muted-foreground">
            No agents join this group yet.
          </p>
        ) : (
          agents.map((agent) => (
            <button
              type="button"
              key={agent.id}
              onClick={() => navigate(`/agents/${agent.id}`)}
              className={cn(
                "flex w-full items-center gap-2.5 border-b border-border px-3.75 py-2.75 text-left",
                "hover:bg-muted/45",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary font-mono text-[10.5px] font-bold text-secondary-foreground">
                {deriveAgentInitials(agent.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">{agent.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatOtherGroupsLine(otherGroupNames(agent, groupName))}
                </div>
              </div>
              <ChevronRight
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          ))
        )}
        <p className="px-3.75 py-2.75 text-[11.5px] leading-relaxed text-muted-foreground">
          If you change this policy, these agents use the new permissions on the
          next tool call. The change does not wait for the next run.
        </p>
      </CardContent>
    </Card>
  );
}
