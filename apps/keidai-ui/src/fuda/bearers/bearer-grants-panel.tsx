import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { Grant, ManagementAgent } from "../api/fuda-client.js";
import { AgentGroupBadge } from "../agents/components/agent-group-chip.js";
import { deriveAgentInitials } from "../agents/utils/derive-agent-initials.js";

export interface BearerGrantsPanelProps {
  bearerId: string;
  bearerName: string;
  agents: ManagementAgent[];
  grants: Grant[];
  knownGroupNames: string[];
  onGrant: (agentId: string) => Promise<void>;
  onRevoke: (agentId: string) => Promise<void>;
}

export function BearerGrantsPanel({
  bearerId,
  bearerName,
  agents,
  grants,
  knownGroupNames,
  onGrant,
  onRevoke,
}: BearerGrantsPanelProps) {
  const [granting, setGranting] = useState(false);
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null);

  const grantedAgentIds = useMemo(
    () => new Set(grants.map((grant) => grant.agentId)),
    [grants],
  );
  const grantedAgents = agents.filter((agent) =>
    grantedAgentIds.has(agent.id),
  );
  const candidateAgents = agents.filter(
    (agent) => !grantedAgentIds.has(agent.id),
  );

  const groupCount = grantedAgents.reduce(
    (total, agent) => total + agent.groups.length,
    0,
  );
  const sentence =
    grantedAgents.length === 0
      ? `${bearerName} is registered but granted nothing — it can prove who it is and go no further.`
      : `${bearerName} may exchange its subject token for ${grantedAgents.length === 1 ? "1 agent" : `${grantedAgents.length} agents`}, reaching ${groupCount === 1 ? "1 group" : `${groupCount} groups`} in total.`;

  async function handleGrant(agentId: string) {
    setPendingAgentId(agentId);
    try {
      await onGrant(agentId);
      setGranting(false);
    } finally {
      setPendingAgentId(null);
    }
  }

  async function handleRevoke(agentId: string) {
    setPendingAgentId(agentId);
    try {
      await onRevoke(agentId);
    } finally {
      setPendingAgentId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card px-[18px] py-4">
        <p className="text-[13.5px] leading-relaxed">{sentence}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          A grant is authorization to exchange, nothing else. What the call may
          then do comes from the agent&apos;s groups and Torii&apos;s policy —{" "}
          <span className="font-mono text-foreground">{bearerId}</span>{" "}
          carries no permissions of its own.
        </p>
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border px-[18px] py-3.5">
          <div className="text-sm font-semibold">Granted agents</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setGranting((prev) => !prev)}
          >
            <Plus className="size-3.5" aria-hidden />
            Grant an agent
          </Button>
        </CardHeader>

        {granting ? (
          <div className="border-b border-border bg-muted/30 px-[18px] py-3.5">
            <div className="mb-2 text-xs text-muted-foreground">
              Agents this bearer cannot yet act as:
            </div>
            <div className="flex flex-col gap-1.5">
              {candidateAgents.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  This bearer is already granted every registered agent.
                </p>
              ) : (
                candidateAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5"
                  >
                    <Avatar size="sm" className="shrink-0">
                      <AvatarFallback className="bg-secondary text-[10px] text-secondary-foreground">
                        {deriveAgentInitials(agent.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{agent.name}</div>
                      <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                        {agent.slug} ·{" "}
                        {agent.groups.length === 0
                          ? "no groups"
                          : agent.groups.join(", ")}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="ml-auto shrink-0"
                      disabled={pendingAgentId === agent.id}
                      onClick={() => void handleGrant(agent.id)}
                    >
                      Grant
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {grantedAgents.length > 0 ? (
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto py-2.5 pl-[18px] text-xs font-medium">
                    Agent
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Inherited groups
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Granted
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-xs font-medium">
                    Last token
                  </TableHead>
                  <TableHead className="h-auto py-2.5 pr-[18px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grantedAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="py-3 pl-[18px]">
                      <Link
                        to={`/agents/${encodeURIComponent(agent.id)}`}
                        className="flex items-center gap-2.5 hover:opacity-90"
                      >
                        <Avatar size="sm" className="shrink-0">
                          <AvatarFallback className="bg-secondary text-[10px] text-secondary-foreground">
                            {deriveAgentInitials(agent.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold">
                            {agent.name}
                          </div>
                          <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                            {agent.slug}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex max-w-[240px] flex-wrap gap-1.5">
                        {agent.groups.length > 0 ? (
                          agent.groups.map((group) => (
                            <AgentGroupBadge
                              key={group}
                              name={group}
                              known={knownGroupNames.includes(group)}
                            />
                          ))
                        ) : (
                          <span className="text-[12.5px] text-muted-foreground">
                            No groups
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 font-mono text-[12.5px] text-muted-foreground">
                      —
                    </TableCell>
                    <TableCell className="py-3 font-mono text-[12.5px] text-muted-foreground">
                      never
                    </TableCell>
                    <TableCell className="py-3 pr-[18px] text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pendingAgentId === agent.id}
                        onClick={() => void handleRevoke(agent.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        ) : (
          <div className="px-6 py-10 text-center">
            <div className="text-sm font-semibold">
              This bearer cannot act as any agent
            </div>
            <p className="mx-auto mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-muted-foreground">
              Its subject token still validates to{" "}
              <span className="font-mono">{bearerId}</span>, but every
              exchange returns{" "}
              <span className="font-mono">
                403 bearer not granted for agent
              </span>{" "}
              until an agent is granted.
            </p>
            <Button
              type="button"
              size="sm"
              className="mt-4"
              onClick={() => setGranting(true)}
            >
              <Plus className="size-3.5" aria-hidden />
              Grant an agent
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
