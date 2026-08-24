import {
  Button,
  cn,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@keidai/ui";
import type { GroupView } from "@keidai/shared";
import { ExternalLink, Search, UsersRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ManagementAgent } from "../lib/api/agents.js";
import { GROUPS_PATH } from "../shell/navigation.js";
import { filterJoinableGroups } from "./utils/filter-joinable-groups.js";
import { isKnownGroup } from "./utils/collect-unknown-groups.js";

export interface AgentGroupsPanelProps {
  agent: ManagementAgent;
  definedGroups: GroupView[];
  groupsLoading: boolean;
  onChangeGroups: (groups: string[]) => Promise<void>;
  onNotify: (message: string) => void;
}

export function AgentGroupsPanel({
  agent,
  definedGroups,
  groupsLoading,
  onChangeGroups,
  onNotify,
}: AgentGroupsPanelProps) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const definedByName = useMemo(
    () => new Map(definedGroups.map((group) => [group.name, group])),
    [definedGroups],
  );
  const knownNames = useMemo(
    () => definedGroups.map((group) => group.name),
    [definedGroups],
  );
  const joinable = useMemo(
    () => filterJoinableGroups(definedGroups, agent.groups, query),
    [agent.groups, definedGroups, query],
  );

  async function applyGroups(next: string[], toast: string) {
    setIsSaving(true);
    setError(null);
    try {
      await onChangeGroups(next);
      onNotify(toast);
      setAdding(false);
      setQuery("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to update groups",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-3.5 border-b border-border px-[18px] py-3.5">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold">Groups</div>
          <p className="mt-0.5 text-xs leading-normal text-muted-foreground">
            Membership is how this agent gets abilities. Policy lives under
            Configure → Groups &amp; tools.
          </p>
        </div>
        {adding ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7.5 shrink-0 border-dashed"
            disabled={isSaving || groupsLoading}
            onClick={() => {
              setAdding(true);
              setQuery("");
            }}
          >
            Join a group
          </Button>
        )}
      </div>

      {adding ? (
        <div className="border-b border-border px-[18px] py-3">
          <div className="relative max-w-[380px]">
            <InputGroup className="h-8.5">
              <InputGroupAddon align="inline-start">
                <InputGroupText>
                  <Search aria-hidden />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search defined groups…"
                aria-label="Search defined groups"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setAdding(false);
                    setQuery("");
                  }
                }}
              />
              <InputGroupAddon align="inline-end">
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Cancel joining a group"
                  onClick={() => {
                    setAdding(false);
                    setQuery("");
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </InputGroupAddon>
            </InputGroup>
            <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              {joinable.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">
                  {definedGroups.length === 0
                    ? "No defined groups yet."
                    : definedGroups.length === agent.groups.filter((name) =>
                          isKnownGroup(name, knownNames),
                        ).length
                      ? "This agent is already in every defined group."
                      : "No group matches that search."}
                </p>
              ) : (
                joinable.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    disabled={isSaving}
                    onClick={() =>
                      void applyGroups(
                        [...agent.groups, group.name],
                        `Joined ${group.name}. Effective tools recomputed.`,
                      )
                    }
                    className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/45"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[12.5px] font-medium">
                        {group.name}
                      </div>
                      <div className="mt-px truncate text-[11px] text-muted-foreground">
                        {group.description || "No description"}
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      +{group.servers.length} server
                      {group.servers.length === 1 ? "" : "s"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {agent.groups.length === 0 ? (
        <p className="px-[18px] py-4 text-[12.5px] leading-normal text-muted-foreground">
          No groups. Every tool call this agent makes will be denied at the
          gateway.
        </p>
      ) : (
        agent.groups.map((name) => {
          const defined = definedByName.get(name);
          const known = Boolean(defined);
          const servers = defined?.servers.map((policy) => policy.server) ?? [];
          return (
            <div
              key={name}
              className="flex items-center gap-3 border-b border-border px-[18px] py-3 last:border-b-0 hover:bg-muted/45"
            >
              <div
                className={cn(
                  "flex size-7.5 shrink-0 items-center justify-center rounded-lg",
                  known
                    ? "bg-secondary text-secondary-foreground"
                    : "bg-[color-mix(in_srgb,var(--destructive)_16%,transparent)] text-destructive",
                )}
              >
                <UsersRound className="size-3.5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "font-mono text-[13.5px] font-semibold",
                      known ? "text-foreground" : "text-destructive",
                    )}
                  >
                    {name}
                  </span>
                  {known ? null : (
                    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--destructive)_16%,transparent)] px-2 py-px text-[11px] text-destructive">
                      not defined
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11.5px] leading-normal text-muted-foreground">
                  {known
                    ? `${defined?.description || "No description"}${
                        servers.length > 0 ? ` · reaches ${servers.join(", ")}` : ""
                      }`
                    : "No policy defines this group, so it grants nothing and every call relying on it is denied at the gateway. Define it or leave it."}
                </p>
              </div>
              {known ? (
                <Link
                  to={`${GROUPS_PATH}/${encodeURIComponent(name)}`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  Open policy
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6.5 shrink-0 text-muted-foreground"
                disabled={isSaving}
                aria-label={`Leave ${name}`}
                onClick={() =>
                  void applyGroups(
                    agent.groups.filter((existing) => existing !== name),
                    `Left ${name}. Effective tools recomputed.`,
                  )
                }
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </div>
          );
        })
      )}

      {error ? (
        <p className="px-[18px] py-2.5 text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
