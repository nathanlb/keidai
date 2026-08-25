import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import {
  Bot,
  ChevronRight,
  KeyRound,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { PageEmptyState } from "../shell/components/page-content/page-empty-state.js";
import { useFetchAgents } from "../lib/hooks/use-fetch-agents.js";
import { useAgentListExtras } from "./hooks/use-agent-list-extras.js";
import { useFetchToriiGroups } from "./hooks/use-fetch-torii-groups.js";
import { PLATFORM_BEARER_ID } from "../lib/constants/platform-bearer.js";
import { AgentGroupBadge } from "./components/agent-group-chip.js";
import { deriveAgentInitials } from "../lib/utils/derive-agent-initials.js";
import { collectUnknownGroups } from "./utils/collect-unknown-groups.js";
import { filterAgents } from "./utils/filter-agents.js";
import { formatRelativeTime } from "./utils/format-relative-time.js";

const SHOW_OWNER = true;

function AgentsPageHeader({ onNewAgent }: { onNewAgent: () => void }) {
  return (
    <div className="mb-4.5 flex items-start justify-between gap-4">
      <div>
        <div className="text-[23px] font-bold tracking-tight">Agents</div>
        <div className="
          mt-0.5 text-[13.5px] leading-normal text-muted-foreground
        ">
          Who an agent is and what it may do. Shaiden runs every agent.
        </div>
      </div>
      <Button type="button" size="sm" onClick={onNewAgent} className="shrink-0">
        <Plus className="size-3.5" aria-hidden />
        New agent
      </Button>
    </div>
  );
}

function UnknownGroupsBanner({ names }: { names: string[] }) {
  const summary =
    names.length === 1
      ? `1 group in use is not defined in Torii: ${names[0]}.`
      : `${names.length} groups in use are not defined in Torii: ${names.join(", ")}.`;

  return (
    <div className="
      mb-3 flex items-start gap-2.5 rounded-md border border-amber-500/45
      bg-amber-500/10 px-3.5 py-2.5 text-[13px] leading-normal
    ">
      <TriangleAlert
        className="mt-0.5 size-3.5 shrink-0 text-amber-500"
        aria-hidden
      />
      <span>
        {summary} Requests from these agents will be denied at policy time until
        Torii defines the group.
      </span>
    </div>
  );
}

function AgentsEmptyState({ onNewAgent }: { onNewAgent: () => void }) {
  return (
    <PageEmptyState
      icon={<Bot className="size-6.5" aria-hidden />}
      title="No agents yet"
      description="An agent carries a persona and a set of groups. Shaiden runs it. Create the first one to get started."
      action={
        <Button type="button" size="sm" onClick={onNewAgent}>
          <Plus className="size-3.5" aria-hidden />
          New agent
        </Button>
      }
    />
  );
}

export function AgentsListView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const { data, error, isLoading } = useFetchAgents();
  const { data: toriiGroupsData } = useFetchToriiGroups();

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const knownGroupNames = useMemo(
    () => (toriiGroupsData?.groups ?? []).map((group) => group.name),
    [toriiGroupsData],
  );
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents]);
  const { extras } = useAgentListExtras(agentIds);

  const filteredAgents = useMemo(
    () => filterAgents(agents, query),
    [agents, query],
  );

  const unknownGroupNames = useMemo(() => {
    const allGroups = agents.flatMap((agent) => agent.groups);
    return [...new Set(collectUnknownGroups(allGroups, knownGroupNames))];
  }, [agents, knownGroupNames]);

  const openAgent = (agentId: string) => navigate(`/agents/${agentId}`);
  const goToCreate = () => navigate("/agents/new");

  if (isLoading && !data) {
    return (
      <>
        <AgentsPageHeader onNewAgent={goToCreate} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" aria-hidden />
          Loading agents…
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <AgentsPageHeader onNewAgent={goToCreate} />
        <p className="text-sm text-destructive">
          Could not load agents from Fuda.
        </p>
      </>
    );
  }

  return (
    <>
      <AgentsPageHeader onNewAgent={goToCreate} />

      {agents.length === 0 ? (
        <AgentsEmptyState onNewAgent={goToCreate} />
      ) : (
        <div className="space-y-3">
          <InputGroup className="h-9">
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <Search aria-hidden />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by name, slug, or group…"
              aria-label="Filter agents"
            />
          </InputGroup>

          {unknownGroupNames.length > 0 ? (
            <UnknownGroupsBanner names={unknownGroupNames} />
          ) : null}

          <Card className="overflow-hidden shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="
                      h-auto py-2.5 pl-4.5 text-xs font-medium
                    ">
                      Agent
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Persona
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Groups
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Runtime
                    </TableHead>
                    {SHOW_OWNER ? (
                      <TableHead className="h-auto py-2.5 text-xs font-medium">
                        Owner
                      </TableHead>
                    ) : null}
                    <TableHead className="h-auto w-8 py-2.5 pr-4.5" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAgents.map((agent) => {
                    const extra = extras.get(agent.id);
                    const personaWhen = extra?.currentPersonaCreatedAt
                      ? formatRelativeTime(extra.currentPersonaCreatedAt)
                      : "—";
                    const bearerCount = extra?.bearerCount ?? 0;

                    return (
                      <TableRow
                        key={agent.id}
                        onClick={() => openAgent(agent.id)}
                        className="
                          cursor-pointer
                          hover:bg-muted/30
                        "
                      >
                        <TableCell className="py-3 pl-4.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar size="sm" className="shrink-0">
                              <AvatarFallback className="
                                bg-secondary text-[10px]
                                text-secondary-foreground
                              ">
                                {deriveAgentInitials(agent.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="
                                truncate text-[13px] font-semibold
                              ">
                                {agent.name}
                              </div>
                              <div className="
                                truncate font-mono text-[11.5px]
                                text-muted-foreground
                              ">
                                {agent.slug}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap">
                          <div className="font-mono text-[12.5px]">
                            v{agent.currentPersonaVersion}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {personaWhen}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex max-w-65 flex-wrap gap-1.5">
                            {agent.groups.length > 0 ? (
                              agent.groups.map((group) => (
                                <AgentGroupBadge
                                  key={group}
                                  name={group}
                                  known={knownGroupNames.includes(group)}
                                />
                              ))
                            ) : (
                              <span className="
                                text-[12.5px] text-muted-foreground
                              ">
                                No groups
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="
                            flex items-center gap-1.5 text-muted-foreground
                          ">
                            <KeyRound
                              className="size-3.5 shrink-0"
                              aria-hidden
                            />
                            <span className="
                              font-mono text-[12.5px] text-foreground
                            ">
                              {bearerCount === 0 ? "—" : PLATFORM_BEARER_ID}
                            </span>
                          </div>
                        </TableCell>
                        {SHOW_OWNER ? (
                          <TableCell className="
                            py-3 font-mono text-[12.5px] text-muted-foreground
                          ">
                            {agent.ownerId}
                          </TableCell>
                        ) : null}
                        <TableCell className="py-3 pr-4.5 text-right">
                          <ChevronRight
                            className="ml-auto size-4 text-muted-foreground"
                            aria-hidden
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="
                border-t border-border px-4.5 py-2.5 text-xs
                text-muted-foreground
              ">
                Showing{" "}
                <span className="font-mono text-foreground">
                  {filteredAgents.length}
                </span>{" "}
                of <span className="font-mono">{agents.length}</span> agents
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
