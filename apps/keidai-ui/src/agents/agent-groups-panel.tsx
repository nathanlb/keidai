import { Button, Input } from "@keidai/ui";
import {
  Circle,
  CircleCheckBig,
  TriangleAlert,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ToriiGroupDefinition } from "../lib/api/gateway.js";
import type { ManagementAgent } from "../lib/api/agents.js";
import { AgentGroupChip } from "./components/agent-group-chip.js";
import {
  collectUnknownGroups,
  isKnownGroup,
} from "./utils/collect-unknown-groups.js";

export interface AgentGroupsPanelProps {
  agent: ManagementAgent;
  toriiGroups: ToriiGroupDefinition[];
  onChangeGroups: (groups: string[]) => Promise<void>;
}

export function AgentGroupsPanel({
  agent,
  toriiGroups,
  onChangeGroups,
}: AgentGroupsPanelProps) {
  const [groupInput, setGroupInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const knownGroupNames = useMemo(
    () => toriiGroups.map((group) => group.name),
    [toriiGroups],
  );
  const unknownGroups = useMemo(
    () => collectUnknownGroups(agent.groups, knownGroupNames),
    [agent.groups, knownGroupNames],
  );

  const candidateGroup = groupInput.trim();
  const addDisabled = !candidateGroup || agent.groups.includes(candidateGroup);

  async function applyGroups(nextGroups: string[]) {
    setIsSaving(true);
    try {
      await onChangeGroups(nextGroups);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd() {
    if (addDisabled) {
      return;
    }
    await applyGroups([...agent.groups, candidateGroup]);
    setGroupInput("");
  }

  async function handleRemove(group: string) {
    await applyGroups(agent.groups.filter((existing) => existing !== group));
  }

  async function handleToggleTorii(group: string) {
    const isMember = agent.groups.includes(group);
    await applyGroups(
      isMember
        ? agent.groups.filter((existing) => existing !== group)
        : [...agent.groups, group],
    );
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_296px]">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4.5 py-3.5">
          <div className="text-sm font-semibold">Groups</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Torii keys its policy on these strings. Fuda stores them as written.
          </div>
        </div>

        <div className="px-4.5 py-4">
          <div className="flex flex-wrap gap-1.5">
            {agent.groups.length > 0 ? (
              agent.groups.map((group) => (
                <AgentGroupChip
                  key={group}
                  name={group}
                  known={isKnownGroup(group, knownGroupNames)}
                  onRemove={() => void handleRemove(group)}
                />
              ))
            ) : (
              <p className="text-[13px] text-muted-foreground">
                No groups. Every gated tool call will be denied.
              </p>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Input
              value={groupInput}
              onChange={(event) => setGroupInput(event.target.value)}
              placeholder="Add a group…"
              className="h-9 max-w-70"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAdd();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              disabled={addDisabled || isSaving}
              onClick={() => void handleAdd()}
            >
              Add
            </Button>
          </div>

          {unknownGroups.length > 0 ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-md border border-amber-500/45 bg-amber-500/10 px-3.5 py-2.5 text-[13px] leading-normal">
              <TriangleAlert
                className="mt-0.5 size-3.75 shrink-0 text-amber-500"
                aria-hidden
              />
              <span>
                {unknownGroups.length === 1
                  ? `Torii does not define ${unknownGroups[0]}.`
                  : `Torii does not define ${unknownGroups.join(", ")}.`}{" "}
                Fuda will save it — Torii fails closed on groups it does not
                define, so calls relying on it will be denied.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3.75 py-3">
          <UsersRound className="size-3.5 text-muted-foreground" aria-hidden />
          <div className="text-[13px] font-semibold">Defined in Torii</div>
        </div>
        <div className="flex flex-col">
          {toriiGroups.length === 0 ? (
            <p className="px-3.75 py-3 text-[12.5px] text-muted-foreground">
              No group definitions available yet.
            </p>
          ) : (
            toriiGroups.map((group) => {
              const isMember = agent.groups.includes(group.name);
              return (
                <button
                  type="button"
                  key={group.name}
                  onClick={() => void handleToggleTorii(group.name)}
                  className="flex items-center gap-2.5 border-b border-border px-3.75 py-2.5 text-left hover:bg-muted/30"
                >
                  {isMember ? (
                    <CircleCheckBig
                      className="size-3.75 shrink-0 text-(--green-600)"
                      aria-hidden
                    />
                  ) : (
                    <Circle
                      className="size-3.75 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono text-xs">{group.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {group.description}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
        <div className="px-3.75 py-2.5 text-[11.5px] leading-normal text-muted-foreground">
          Authored on Groups &amp; tools. A soft join — Fuda does not validate
          group names on write.
        </div>
      </div>
    </div>
  );
}
