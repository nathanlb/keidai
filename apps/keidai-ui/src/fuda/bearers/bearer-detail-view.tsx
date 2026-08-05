import {
  Badge,
  Button,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@keidai/ui";
import { ArrowLeft, Bot, Clock, Lock, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { useSWRConfig } from "swr";
import {
  deleteBearer,
  grantBearer,
  revokeBearerGrant,
  updateBearer,
} from "../api/fuda-client.js";
import { AgentsToast } from "../agents/components/agents-toast.js";
import { useAgentsToast } from "../agents/hooks/use-agents-toast.js";
import {
  invalidateBearerCaches,
  invalidateGrantCaches,
} from "../hooks/invalidate-grant-caches.js";
import { agentGrantsKey } from "../hooks/use-fetch-agent-grants.js";
import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import { useFetchBearer } from "../hooks/use-fetch-bearer.js";
import { useFetchToriiGroups } from "../hooks/use-fetch-torii-groups.js";
import { BearerGrantsPanel } from "./bearer-grants-panel.js";
import { BearerIdentityPanel } from "./bearer-identity-panel.js";

type DetailTab = "grants" | "identity";

const TAB_PARAM = "tab";
const VALID_TABS: DetailTab[] = ["grants", "identity"];

function parseTab(value: string | null): DetailTab {
  return VALID_TABS.includes(value as DetailTab)
    ? (value as DetailTab)
    : "grants";
}

export function BearerDetailView() {
  const { bearerId: rawBearerId } = useParams<{ bearerId: string }>();
  const bearerId = rawBearerId ? decodeURIComponent(rawBearerId) : undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate } = useSWRConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get(TAB_PARAM));

  const navigationToast =
    (location.state as { toast?: string } | null)?.toast ?? null;
  const initialToastRef = useRef(navigationToast);
  const { message: toastMessage, showToast } = useAgentsToast(
    initialToastRef.current,
  );

  const { data, error, isLoading, refresh } = useFetchBearer(bearerId);
  const { data: agentsData } = useFetchAgents();
  const { data: toriiGroupsData } = useFetchToriiGroups();

  useEffect(() => {
    if (initialToastRef.current) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
  }, []);

  const setTab = useCallback(
    (next: DetailTab) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === "grants") {
            params.delete(TAB_PARAM);
          } else {
            params.set(TAB_PARAM, next);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading bearer…
      </div>
    );
  }

  if (error || !data || !bearerId) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 text-muted-foreground"
          onClick={() => navigate("/bearers")}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All bearers
        </Button>
        <p className="text-sm text-destructive">
          Could not load this bearer from Fuda. It may have been deleted.
        </p>
      </>
    );
  }

  const bearer = data.bearer;
  const grants = data.grants;
  const agents = agentsData?.agents ?? [];
  const knownGroupNames = (toriiGroupsData?.groups ?? []).map(
    (group) => group.name,
  );
  const firstGrantedSlug =
    agents.find((agent) => agent.id === grants[0]?.agentId)?.slug ?? null;

  async function handleGrant(agentId: string) {
    const agent = agents.find((item) => item.id === agentId);
    await grantBearer(bearer.bearerId, agentId);
    await invalidateGrantCaches(mutate, {
      bearerId: bearer.bearerId,
      agentId,
    });
    await refresh();
    showToast(
      `Granted. ${bearer.bearerId} may now exchange into ${agent?.slug ?? agentId}.`,
    );
  }

  async function handleRevoke(agentId: string) {
    const agent = agents.find((item) => item.id === agentId);
    await revokeBearerGrant(bearer.bearerId, agentId);
    await invalidateGrantCaches(mutate, {
      bearerId: bearer.bearerId,
      agentId,
    });
    await refresh();
    showToast(
      `Grant revoked. Exchanges for ${agent?.slug ?? agentId} now fail closed.`,
    );
  }

  async function handleRename(displayName: string) {
    await updateBearer(bearer.bearerId, { displayName });
    await invalidateBearerCaches(mutate, bearer.bearerId);
    await refresh();
    showToast("Display name updated.");
  }

  async function handleDelete() {
    const grantCount = grants.length;
    await deleteBearer(bearer.bearerId);
    await invalidateBearerCaches(mutate, bearer.bearerId);
    await Promise.all(
      grants.map((grant) => mutate(agentGrantsKey(grant.agentId))),
    );
    navigate("/bearers", {
      state: {
        toast: `Bearer deleted along with ${grantCount} grant${grantCount === 1 ? "" : "s"}.`,
      },
    });
  }

  const grantLabel =
    grants.length === 0
      ? "No agent granted"
      : grants.length === 1
        ? "May act as 1 agent"
        : `May act as ${grants.length} agents`;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 text-muted-foreground"
        onClick={() => navigate("/bearers")}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All bearers
      </Button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-[23px] font-bold tracking-tight">
            {bearer.displayName}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="gap-1.5 font-mono text-[11.5px] text-muted-foreground"
              >
                <Lock className="size-3" aria-hidden />
                {bearer.bearerId}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Immutable — this is what the validator maps to and what appears in
              minted tokens
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3.5 text-[12.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Bot className="size-3" aria-hidden />
            {grantLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3" aria-hidden />
            Last token never
          </span>
        </div>
      </div>

      <div className="mb-5 mt-5 flex gap-1 border-b border-border">
        {(
          [
            {
              key: "grants" as const,
              label: "Grants",
              count: grants.length,
              warn: grants.length === 0,
            },
            { key: "identity" as const, label: "Identity", count: null, warn: false },
          ] as const
        ).map((item) => {
          const isActive = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] " +
                (isActive
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground")
              }
            >
              {item.label}
              {item.count !== null ? (
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  {item.count}
                </span>
              ) : null}
              {item.warn ? (
                <TriangleAlert
                  className="size-3 text-amber-500"
                  aria-label="No grants"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "grants" ? (
        <BearerGrantsPanel
          bearerId={bearer.bearerId}
          bearerName={bearer.displayName}
          agents={agents}
          grants={grants}
          knownGroupNames={knownGroupNames}
          onGrant={handleGrant}
          onRevoke={handleRevoke}
        />
      ) : null}

      {tab === "identity" ? (
        <BearerIdentityPanel
          bearerId={bearer.bearerId}
          displayName={bearer.displayName}
          grantCount={grants.length}
          firstGrantedSlug={firstGrantedSlug}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      ) : null}

      <AgentsToast message={toastMessage} />
    </>
  );
}
