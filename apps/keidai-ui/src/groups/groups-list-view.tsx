import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@keidai/ui";
import { ChevronRight, Plus, UsersRound } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { PageEmptyState } from "../shell/components/page-content/page-empty-state.js";
import { useFetchAgents } from "../lib/hooks/use-fetch-agents.js";
import { deriveAgentInitials } from "../lib/utils/derive-agent-initials.js";
import { GROUPS_PATH } from "../shell/navigation.js";
import { useFetchGroups } from "./hooks/use-fetch-groups.js";
import { useFetchServerCatalogues } from "./hooks/use-fetch-server-catalogues.js";
import { UndefinedGroupsBanner } from "./components/undefined-groups-banner.js";
import { collectUndefinedGroups } from "./utils/collect-undefined-groups.js";
import { countGroupGrants } from "./utils/count-group-grants.js";
import {
  formatAgentCountLabel,
  formatGatedLabel,
  formatGrantsLabel,
  formatListFooter,
} from "./utils/format-groups-copy.js";

function GroupsPageHeader({ onNewGroup }: { onNewGroup: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="max-w-[620px]">
        <div className="text-[23px] font-bold tracking-tight">
          Groups & tools
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
          A group is a named policy over one or more servers. Agents get their
          abilities by joining groups — nothing an agent does is permitted
          unless a group it belongs to allows it.
        </p>
      </div>
      <Button type="button" className="h-9 shrink-0" onClick={onNewGroup}>
        <Plus className="size-[15px]" aria-hidden />
        New group
      </Button>
    </div>
  );
}

export function GroupsListView() {
  const navigate = useNavigate();
  const { data, error, isLoading } = useFetchGroups();
  const { data: agentsData } = useFetchAgents();
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);

  const serverNames = useMemo(() => {
    const names = new Set<string>();
    for (const group of groups) {
      for (const policy of group.servers) {
        names.add(policy.server);
      }
    }
    return [...names];
  }, [groups]);

  const { catalogues } = useFetchServerCatalogues(serverNames);
  const knownNames = useMemo(() => groups.map((group) => group.name), [groups]);
  const undefinedRefs = useMemo(
    () => collectUndefinedGroups(agents, knownNames),
    [agents, knownNames],
  );

  const goCreate = () => navigate(`${GROUPS_PATH}/new`);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col gap-4">
        <GroupsPageHeader onNewGroup={goCreate} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" aria-hidden />
          Loading groups…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <GroupsPageHeader onNewGroup={goCreate} />
        <p className="text-sm text-destructive">
          Could not load groups from Torii.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <GroupsPageHeader onNewGroup={goCreate} />

      {undefinedRefs.length > 0 ? (
        <UndefinedGroupsBanner refs={undefinedRefs} />
      ) : null}

      {groups.length === 0 ? (
        <PageEmptyState
          icon={<UsersRound className="size-6.5" aria-hidden />}
          title="No groups yet"
          description="Author a named policy over one or more servers. Agents join groups to inherit those tools."
          action={
            <Button type="button" size="sm" onClick={goCreate}>
              <Plus className="size-3.5" aria-hidden />
              New group
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-auto py-2.5 pl-4 text-[10.5px] font-semibold uppercase tracking-wider">
                    Group
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">
                    Reaches
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">
                    Grants
                  </TableHead>
                  <TableHead className="h-auto py-2.5 text-[10.5px] font-semibold uppercase tracking-wider">
                    Agents
                  </TableHead>
                  <TableHead className="h-auto w-[18px] py-2.5 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => {
                  const members = agents.filter((agent) =>
                    agent.groups.includes(group.name),
                  );
                  const grants = countGroupGrants(group.servers, catalogues);
                  const gatedLabel = formatGatedLabel(grants.gated);
                  const overflow = members.length - 2;

                  return (
                    <TableRow
                      key={group.id}
                      className="cursor-pointer hover:bg-muted/45"
                      onClick={() => navigate(`${GROUPS_PATH}/${group.name}`)}
                    >
                      <TableCell className="max-w-0 py-3 pl-4">
                        <div className="font-mono text-[13.5px] font-semibold">
                          {group.name}
                        </div>
                        <div className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {group.description || "No description"}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {group.servers.map((policy) => (
                            <Badge
                              key={policy.server}
                              variant="secondary"
                              className="rounded-full font-mono text-[11px] font-normal"
                            >
                              {policy.server}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="text-[12.5px]">
                          {formatGrantsLabel(
                            grants.allowed,
                            grants.catalogueComplete ? grants.total : null,
                          )}
                        </div>
                        {gatedLabel ? (
                          <div className="mt-0.5 text-[11.5px] text-amber-500">
                            {gatedLabel}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="overflow-hidden py-3">
                        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                          {members.slice(0, 2).map((agent) => (
                            <Avatar
                              key={agent.id}
                              size="sm"
                              className="size-[22px] shrink-0"
                            >
                              <AvatarFallback className="bg-secondary font-mono text-[9.5px] font-bold text-secondary-foreground">
                                {deriveAgentInitials(agent.name)}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                          {overflow > 0 ? (
                            <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">
                              +{overflow}
                            </span>
                          ) : null}
                          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-muted-foreground">
                            {formatAgentCountLabel(members.length)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 pr-4">
                        <ChevronRight
                          className="size-[15px] text-muted-foreground"
                          aria-hidden
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t border-border px-4 py-[11px] text-[12px] text-muted-foreground">
              {formatListFooter(groups.length, undefinedRefs.length)}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
