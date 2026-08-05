import {
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
import { ChevronRight, KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { PageEmptyState } from "../../shell/components/page-content/page-empty-state.js";
import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import { AgentsToast } from "../agents/components/agents-toast.js";
import { useAgentsToast } from "../agents/hooks/use-agents-toast.js";
import { useBearerListExtras } from "../hooks/use-bearer-list-extras.js";
import { useFetchBearers } from "../hooks/use-fetch-bearers.js";

function BearersPageHeader({ onNewBearer }: { onNewBearer: () => void }) {
  return (
    <div className="mb-[18px] flex items-start justify-between gap-4">
      <div>
        <div className="text-[23px] font-bold tracking-tight">Bearers</div>
        <div className="mt-0.5 text-[13.5px] leading-normal text-muted-foreground">
          Named principals a subject credential maps to. Grants decide which
          agents each may become.
        </div>
      </div>
      <Button type="button" size="sm" onClick={onNewBearer} className="shrink-0">
        <Plus className="size-3.5" aria-hidden />
        New bearer
      </Button>
    </div>
  );
}

function NoGrantsBanner({ names }: { names: string[] }) {
  const summary =
    names.length === 1
      ? `1 bearer has no grants: ${names[0]}.`
      : `${names.length} bearers have no grants: ${names.join(", ")}.`;

  return (
    <div className="mb-3 flex items-start gap-2.5 rounded-md border border-amber-500/45 bg-amber-500/10 px-3.5 py-2.5 text-[13px] leading-normal">
      <TriangleAlert
        className="mt-0.5 size-[15px] shrink-0 text-amber-500"
        aria-hidden
      />
      <span>
        {summary} Their subject tokens validate, but every exchange returns{" "}
        <span className="font-mono">403 bearer not granted for agent</span>.
      </span>
    </div>
  );
}

function BearersEmptyState({ onNewBearer }: { onNewBearer: () => void }) {
  return (
    <PageEmptyState
      icon={<KeyRound className="size-[30px]" aria-hidden />}
      title="No bearers yet"
      description="Register a bearer for each thing that holds a platform credential — a CI job, a worker, your laptop CLI — then grant it the agents it may act as."
      action={
        <Button type="button" size="sm" onClick={onNewBearer}>
          <Plus className="size-3.5" aria-hidden />
          New bearer
        </Button>
      }
    />
  );
}

export function BearersListView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data, error, isLoading } = useFetchBearers();
  const { data: agentsData } = useFetchAgents();

  const navigationToast =
    (location.state as { toast?: string } | null)?.toast ?? null;
  const initialToastRef = useRef(navigationToast);
  const { message: toastMessage } = useAgentsToast(initialToastRef.current);

  useEffect(() => {
    if (initialToastRef.current) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, []);

  const bearers = useMemo(() => data?.bearers ?? [], [data]);
  const agentsById = useMemo(() => {
    const map = new Map(
      (agentsData?.agents ?? []).map((agent) => [agent.id, agent]),
    );
    return map;
  }, [agentsData]);

  const bearerIds = useMemo(
    () => bearers.map((bearer) => bearer.bearerId),
    [bearers],
  );
  const { extras, isLoading: extrasLoading } = useBearerListExtras(bearerIds);

  const ungrantedNames = useMemo(() => {
    if (extrasLoading && extras.size === 0) {
      return [];
    }
    return bearers
      .filter((bearer) => (extras.get(bearer.bearerId)?.grants.length ?? 0) === 0)
      .map((bearer) => bearer.displayName);
  }, [bearers, extras, extrasLoading]);

  const goToCreate = () => navigate("/bearers/new");
  const openBearer = (bearerId: string) =>
    navigate(`/bearers/${encodeURIComponent(bearerId)}`);

  if (isLoading && !data) {
    return (
      <>
        <BearersPageHeader onNewBearer={goToCreate} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" aria-hidden />
          Loading bearers…
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <BearersPageHeader onNewBearer={goToCreate} />
        <p className="text-sm text-destructive">
          Could not load bearers from Fuda.
        </p>
      </>
    );
  }

  return (
    <>
      <BearersPageHeader onNewBearer={goToCreate} />

      {bearers.length === 0 ? (
        <BearersEmptyState onNewBearer={goToCreate} />
      ) : (
        <div className="space-y-3">
          {ungrantedNames.length > 0 ? (
            <NoGrantsBanner names={ungrantedNames} />
          ) : null}

          <Card className="overflow-hidden shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-auto py-2.5 pl-[18px] text-xs font-medium">
                      Bearer
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Mapped from
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      May act as
                    </TableHead>
                    <TableHead className="h-auto py-2.5 text-xs font-medium">
                      Last token
                    </TableHead>
                    <TableHead className="h-auto w-8 py-2.5 pr-[18px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bearers.map((bearer) => {
                    const grants = extras.get(bearer.bearerId)?.grants ?? [];
                    const grantedAgents = grants.map((grant) => {
                      const agent = agentsById.get(grant.agentId);
                      return {
                        agentId: grant.agentId,
                        slug: agent?.slug ?? grant.agentId,
                      };
                    });

                    return (
                      <TableRow
                        key={bearer.bearerId}
                        onClick={() => openBearer(bearer.bearerId)}
                        className="cursor-pointer hover:bg-muted/45"
                      >
                        <TableCell className="py-3 pl-[18px]">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-[7px] bg-muted/60 text-muted-foreground">
                              <KeyRound className="size-3.5" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold">
                                {bearer.displayName}
                              </div>
                              <div className="truncate font-mono text-[11.5px] text-muted-foreground">
                                {bearer.bearerId}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="font-mono text-xs">unmapped</div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            no validator mapping
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex max-w-[280px] flex-wrap gap-1.5">
                            {grantedAgents.length > 0 ? (
                              grantedAgents.map((granted) => (
                                <Link
                                  key={granted.agentId}
                                  to={`/agents/${encodeURIComponent(granted.agentId)}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Badge
                                    variant="secondary"
                                    className="font-mono text-[11px]"
                                  >
                                    {granted.slug}
                                  </Badge>
                                </Link>
                              ))
                            ) : (
                              <Badge
                                variant="outline"
                                className="gap-1 border-amber-500/45 text-[11px] text-amber-500"
                              >
                                <TriangleAlert
                                  className="size-3"
                                  aria-hidden
                                />
                                No grants
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap font-mono text-[12.5px] text-muted-foreground">
                          never
                        </TableCell>
                        <TableCell className="py-3 pr-[18px] text-right">
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
              <div className="border-t border-border px-[18px] py-2.5 text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-mono text-foreground">
                  {bearers.length}
                </span>{" "}
                of <span className="font-mono">{bearers.length}</span>{" "}
                bearers
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <AgentsToast message={toastMessage} />
    </>
  );
}
