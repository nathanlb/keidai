import type { PublicAgentConfig } from "@keidai/shared";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { Bot, Lock, Users } from "lucide-react";
import { useMemo } from "react";
import { useFetchServers } from "../../shell/hooks/use-fetch-servers.js";
import { deriveOwnerInitials } from "../../shell/utils/derive-owner-initials.js";
import { formatAgentSubject } from "./utils/format-agent-subject.js";
import type { OwnerAgentGroup } from "./utils/group-agents-by-owner.js";
import { OwnerAvatar } from "./owner-avatar.js";

function StrictOwnershipBanner() {
  return (
    <div className="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg border border-border bg-background px-4 py-3 text-muted-foreground">
      <Lock className="size-4" aria-hidden />
      <p className="text-sm leading-snug">
        Strict ownership — each agent acts as exactly one owner, fixed at
        registration and never asserted per request. The resolved{" "}
        <span className="font-mono">owner_id</span> selects which delegated
        grant a call uses.
      </p>
    </div>
  );
}

function AgentsEmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <Bot className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">No agents registered</div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          Register an agent bound to an owner to start routing calls. Each agent
          acts as exactly one <span className="font-mono">owner_id</span>, fixed
          at registration — never asserted per request.
        </p>
      </CardContent>
    </Card>
  );
}

function AgentCountLabel({ count }: { count: number }) {
  return (
    <span>
      owner · {count} {count === 1 ? "agent" : "agents"}
    </span>
  );
}

function AgentRow({
  agent,
  serverNames,
}: {
  agent: PublicAgentConfig;
  serverNames: readonly string[];
}) {
  return (
    <TableRow className="border-border hover:bg-muted/30">
      <TableCell className="py-3 pl-[18px]">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <Bot className="size-[15px] shrink-0" aria-hidden />
          <span className="font-mono text-[13px] font-semibold text-foreground">
            {agent.agent_id}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-3 font-mono text-xs text-muted-foreground">
        {formatAgentSubject(agent.subject)}
      </TableCell>
      <TableCell className="py-3">
        <div className="flex flex-wrap gap-1.5">
          {agent.groups.length > 0 ? (
            agent.groups.map((group) => (
              <Badge
                key={group}
                variant="secondary"
                className="font-mono text-[11px]"
              >
                {group}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
      <TableCell className="py-3 pr-[18px]">
        <div className="flex flex-wrap gap-1.5">
          {serverNames.length > 0 ? (
            serverNames.map((server) => (
              <Badge
                key={server}
                variant="outline"
                className="font-mono text-[11px]"
              >
                {server}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function useServerNames(): readonly string[] {
  const { data: serversData } = useFetchServers();
  return useMemo(
    () =>
      (serversData?.servers ?? [])
        .map((server) => server.name)
        .sort((left, right) => left.localeCompare(right)),
    [serversData?.servers],
  );
}

function OwnerAgentGroupCard({
  group,
  showFooterNote = false,
}: {
  group: OwnerAgentGroup;
  showFooterNote?: boolean;
}) {
  const serverNames = useServerNames();
  const initials = deriveOwnerInitials(group.ownerId);

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="flex flex-row items-center gap-[11px] space-y-0 border-border px-[18px] py-3.5">
        <OwnerAvatar initials={initials} className="size-7 text-[11px]" />
        <div className="min-w-0 flex-1">
          <CardTitle className="font-mono text-[13.5px]">
            {group.ownerId}
          </CardTitle>
          <CardDescription className="text-[11.5px]">
            <AgentCountLabel count={group.agents.length} />
          </CardDescription>
        </div>
        <Badge variant="outline" className="ml-auto shrink-0 font-mono">
          owner_id
        </Badge>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto py-2.5 pl-[18px] text-xs font-medium">
                Agent
              </TableHead>
              <TableHead className="h-auto py-2.5 text-xs font-medium">
                Workload subject
              </TableHead>
              <TableHead className="h-auto py-2.5 text-xs font-medium">
                Groups
              </TableHead>
              <TableHead className="h-auto py-2.5 pr-[18px] text-xs font-medium">
                Uses
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.agents.map((agent) => (
              <AgentRow
                key={agent.agent_id}
                agent={agent}
                serverNames={serverNames}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {showFooterNote ? <MultiOwnerFooterNote /> : null}
    </Card>
  );
}

function MultiOwnerFooterNote() {
  return (
    <CardFooter className="gap-1.5 border-t border-dashed border-border px-[18px] py-3.5 text-xs text-muted-foreground">
      <Users className="size-3.5 shrink-0" aria-hidden />
      Additional owners and their agents group here once an external IdP is
      connected.
    </CardFooter>
  );
}

export interface AgentsOwnersViewProps {
  groups: OwnerAgentGroup[];
}

export function AgentsOwnersView({ groups }: AgentsOwnersViewProps) {
  const isEmpty = groups.length === 0;

  return (
    <>
      <StrictOwnershipBanner />

      {isEmpty ? (
        <AgentsEmptyState />
      ) : (
        <div className="space-y-4">
          {groups.map((group, index) => (
            <OwnerAgentGroupCard
              key={group.ownerId}
              group={group}
              showFooterNote={index === groups.length - 1}
            />
          ))}
        </div>
      )}
    </>
  );
}
