import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@keidai/ui";
import {
  Activity,
  ArrowLeft,
  KeyRound,
  Lock,
  Trash2,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { deleteAgent, updateAgent } from "../api/fuda-client.js";
import { RUNS_PATH } from "../../shaiden/navigation.js";
import {
  agentGrantsKey,
  useFetchAgentGrants,
} from "../hooks/use-fetch-agent-grants.js";
import { AGENTS_KEY } from "../../shell/hooks/use-fetch-agents.js";
import { useFetchAgent } from "../hooks/use-fetch-agent.js";
import { useFetchBearers } from "../hooks/use-fetch-bearers.js";
import {
  personaVersionsKey,
  useFetchPersonaVersions,
} from "../hooks/use-fetch-persona-versions.js";
import { useFetchToriiGroups } from "../hooks/use-fetch-torii-groups.js";
import { useSWRConfig } from "swr";
import { AgentAccessPanel } from "./agent-access-panel.js";
import { AgentGroupsPanel } from "./agent-groups-panel.js";
import { AgentPersonaPanel } from "./agent-persona-panel.js";
import { AgentsToast } from "./components/agents-toast.js";
import { useAgentsToast } from "./hooks/use-agents-toast.js";
import { collectUnknownGroups } from "./utils/collect-unknown-groups.js";
import { PLATFORM_BEARER_ID } from "../platform-bearer.js";

type DetailTab = "persona" | "access" | "groups";

const TAB_PARAM = "tab";
const VALID_TABS: DetailTab[] = ["persona", "access", "groups"];

function parseTab(value: string | null): DetailTab {
  return VALID_TABS.includes(value as DetailTab)
    ? (value as DetailTab)
    : "persona";
}

export function AgentDetailView() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { mutate } = useSWRConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get(TAB_PARAM));
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const navigationToast =
    (location.state as { toast?: string } | null)?.toast ?? null;
  const initialToastRef = useRef(navigationToast);
  const { message: toastMessage, showToast } = useAgentsToast(
    initialToastRef.current,
  );

  const { data, error, isLoading, refresh } = useFetchAgent(agentId);
  const {
    data: personaData,
    isLoading: personasLoading,
    refresh: refreshPersonas,
  } = useFetchPersonaVersions(agentId);
  const { data: grantsData } = useFetchAgentGrants(agentId);
  const { data: bearersData } = useFetchBearers();
  const { data: toriiGroupsData } = useFetchToriiGroups();

  // Clear the create-flow toast from navigation state once shown, so a
  // refresh or back-navigation doesn't replay it.
  useEffect(() => {
    if (initialToastRef.current) {
      navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      });
    }
    // Runs once on mount.
  }, []);

  const setTab = useCallback(
    (next: DetailTab) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === "persona") {
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

  const handleDeleteConfirmOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleteError(null);
    }
    setDeleteConfirmOpen(open);
  }, []);

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading agent…
      </div>
    );
  }

  if (error || !data) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 mb-3 text-muted-foreground"
          onClick={() => navigate("/agents")}
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All agents
        </Button>
        <p className="text-sm text-destructive">
          Could not load this agent from Fuda. It may have been deleted.
        </p>
      </>
    );
  }

  const agent = data.agent;
  const versions = personaData?.personas ?? [];
  const grants = grantsData?.grants ?? [];
  const bearers = bearersData?.bearers ?? [];
  const toriiGroups = toriiGroupsData?.groups ?? [];
  const knownGroupNames = toriiGroups.map((group) => group.name);
  const unknownGroupCount = collectUnknownGroups(
    agent.groups,
    knownGroupNames,
  ).length;

  async function handleSavePersona(content: string) {
    const nextVersion = agent.currentPersonaVersion + 1;
    await updateAgent(agent.id, { persona: content });
    await Promise.all([refresh(), refreshPersonas()]);
    await mutate(AGENTS_KEY);
    showToast(
      `Persona saved as v${nextVersion}. v${agent.currentPersonaVersion} stays pinned to past runs.`,
    );
  }

  async function handleRestorePersona(version: {
    version: number;
    content: string;
  }) {
    const nextVersion = agent.currentPersonaVersion + 1;
    await updateAgent(agent.id, { persona: version.content });
    await Promise.all([refresh(), refreshPersonas()]);
    await mutate(AGENTS_KEY);
    showToast(`v${version.version} restored as v${nextVersion}.`);
  }

  async function handleChangeGroups(nextGroups: string[]) {
    await updateAgent(agent.id, { groups: nextGroups });
    await refresh();
    await mutate(AGENTS_KEY);
  }

  async function handleDeleteConfirm() {
    if (!data) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAgent(data.agent.id);
      await mutate(AGENTS_KEY);
      void mutate(personaVersionsKey(data.agent.id), undefined, {
        revalidate: false,
      });
      void mutate(agentGrantsKey(data.agent.id), undefined, {
        revalidate: false,
      });
      navigate("/agents");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete agent",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const runnerName =
    bearers.find((bearer) => bearer.bearerId === PLATFORM_BEARER_ID)
      ?.displayName ?? PLATFORM_BEARER_ID;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 mb-3 text-muted-foreground"
        onClick={() => navigate("/agents")}
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All agents
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="text-[23px] font-bold tracking-tight">
              {agent.name}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className="gap-1.5 font-mono text-[11.5px] text-muted-foreground"
                >
                  <Lock className="size-3" aria-hidden />
                  {agent.slug}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Immutable — this is what appears in traces
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3.5 text-[12.5px] text-muted-foreground">
            <span className="font-mono">{agent.id}</span>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3" aria-hidden />
              Owned by{" "}
              <span className="font-mono text-foreground">{agent.ownerId}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3" aria-hidden />
              {runnerName}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(RUNS_PATH)}
          >
            <Activity className="size-3.5" aria-hidden />
            View runs
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete agent
          </Button>
        </div>
      </div>

      <div className="mb-5 mt-5 flex gap-1 border-b border-border">
        {[
          {
            key: "persona" as const,
            label: "Persona",
            count: agent.currentPersonaVersion,
          },
          { key: "access" as const, label: "Access", count: grants.length },
          {
            key: "groups" as const,
            label: "Groups",
            count: agent.groups.length,
          },
        ].map((item) => {
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
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {item.count}
              </span>
              {item.key === "groups" && unknownGroupCount > 0 ? (
                <span
                  className="size-1.5 rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "persona" ? (
        <AgentPersonaPanel
          agent={agent}
          versions={versions}
          versionsLoading={personasLoading}
          onSave={handleSavePersona}
          onRestore={handleRestorePersona}
        />
      ) : null}

      {tab === "access" ? (
        <AgentAccessPanel agent={agent} bearers={bearers} grants={grants} />
      ) : null}

      {tab === "groups" ? (
        <AgentGroupsPanel
          agent={agent}
          toriiGroups={toriiGroups}
          onChangeGroups={handleChangeGroups}
        />
      ) : null}

      <AgentsToast message={toastMessage} />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={handleDeleteConfirmOpenChange}
      >
        <DialogContent className="max-w-90 sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete agent?</DialogTitle>
            <DialogDescription>
              Delete {agent.name}? This revokes all bearer access and cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              disabled={isDeleting}
            >
              Delete agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
