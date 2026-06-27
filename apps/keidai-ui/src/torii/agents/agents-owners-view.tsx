import type { PublicAgentConfig } from "@keidai/shared";
import { Badge } from "@keidai/ui";
import { Bot, Lock, Users } from "lucide-react";
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
    <div className="flex flex-col items-center rounded-xl border border-border bg-card px-6 py-[60px] text-center">
      <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
        <Bot className="size-[30px]" aria-hidden />
      </span>
      <div className="mt-4 text-base font-semibold">No agents registered</div>
      <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
        Register an agent bound to an owner to start routing calls. Each agent
        acts as exactly one <span className="font-mono">owner_id</span>, fixed
        at registration — never asserted per request.
      </p>
    </div>
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
    <tr className="border-t border-border transition-colors hover:bg-muted/30">
      <td className="py-3 pl-[18px]">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <Bot className="size-[15px] shrink-0" aria-hidden />
          <span className="font-mono text-[13px] font-semibold text-foreground">
            {agent.agent_id}
          </span>
        </div>
      </td>
      <td className="py-3 font-mono text-xs text-muted-foreground">
        {formatAgentSubject(agent.subject)}
      </td>
      <td className="py-3">
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
      </td>
      <td className="py-3 pr-[18px]">
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
      </td>
    </tr>
  );
}

function OwnerAgentGroupCard({
  group,
  serverNames,
  showFooterNote = false,
}: {
  group: OwnerAgentGroup;
  serverNames: readonly string[];
  showFooterNote?: boolean;
}) {
  const initials = deriveOwnerInitials(group.ownerId);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-[11px] border-b border-border bg-muted/30 px-[18px] py-3.5">
        <OwnerAvatar initials={initials} className="size-7 text-[11px]" />
        <div>
          <div className="font-mono text-[13.5px] font-semibold">
            {group.ownerId}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            <AgentCountLabel count={group.agents.length} />
          </div>
        </div>
        <Badge variant="outline" className="ml-auto font-mono">
          owner_id
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="text-xs font-medium text-muted-foreground">
              <th className="py-2.5 pl-[18px] font-medium">Agent</th>
              <th className="py-2.5 font-medium">Workload subject</th>
              <th className="py-2.5 font-medium">Groups</th>
              <th className="py-2.5 pr-[18px] font-medium">Uses</th>
            </tr>
          </thead>
          <tbody>
            {group.agents.map((agent) => (
              <AgentRow
                key={agent.agent_id}
                agent={agent}
                serverNames={serverNames}
              />
            ))}
          </tbody>
        </table>
      </div>

      {showFooterNote ? <MultiOwnerFooterNote /> : null}
    </div>
  );
}

function MultiOwnerFooterNote() {
  return (
    <div className="flex items-center gap-1.5 border-t border-dashed border-border px-[18px] py-3.5 text-xs text-muted-foreground">
      <Users className="size-3.5 shrink-0" aria-hidden />
      Additional owners and their agents group here once an external IdP is
      connected.
    </div>
  );
}

export interface AgentsOwnersViewProps {
  groups: OwnerAgentGroup[];
  serverNames: readonly string[];
}

export function AgentsOwnersView({ groups, serverNames }: AgentsOwnersViewProps) {
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
              serverNames={serverNames}
              showFooterNote={index === groups.length - 1}
            />
          ))}
        </div>
      )}
    </>
  );
}
