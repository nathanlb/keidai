import {
  Badge,
  Button,
  cn,
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
import { ArrowLeft, Lock, Play, Trash2, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { deleteAgent, updateAgent } from "../lib/api/agents.js";
import { runSavedTask } from "../lib/api/tasks.js";
import { AGENTS_KEY } from "../lib/hooks/use-fetch-agents.js";
import { useLiveConnections } from "../lib/hooks/use-live-connections.js";
import { useFetchGroups } from "../groups/hooks/use-fetch-groups.js";
import { useFetchServerCatalogues } from "../groups/hooks/use-fetch-server-catalogues.js";
import { formatRunRelative } from "../runs/utils/format-run-time.js";
import { runDetailHref } from "../runs/navigation.js";
import {
  RUNS_VISIBILITY_KEY,
  useRunsVisibility,
} from "../runs/hooks/use-runs-visibility.js";
import { AGENTS_PATH } from "../shell/navigation.js";
import { TASKS_KEY, useFetchTasks } from "../tasks/hooks/use-fetch-tasks.js";
import { TaskAuthoringDialog } from "../tasks/task-authoring-dialog.js";
import { useSWRConfig } from "swr";
import { AgentEffectiveToolsPanel } from "./agent-effective-tools-panel.js";
import { AgentGroupsPanel } from "./agent-groups-panel.js";
import { AgentPersonaPanel } from "./agent-persona-panel.js";
import { AgentRunsPanel } from "./agent-runs-panel.js";
import { AgentTasksPanel } from "./agent-tasks-panel.js";
import { AgentsToast } from "./components/agents-toast.js";
import { agentGrantsKey } from "./hooks/use-fetch-agent-grants.js";
import { useFetchAgent } from "./hooks/use-fetch-agent.js";
import {
  personaVersionsKey,
  useFetchPersonaVersions,
} from "./hooks/use-fetch-persona-versions.js";
import { useAgentsToast } from "./hooks/use-agents-toast.js";
import {
  collectAgentRuns,
  collectAgentTasks,
  isAgentRunning,
  latestRun,
} from "./utils/agent-activity.js";
import { collectUnknownGroups } from "./utils/collect-unknown-groups.js";

type DetailTab = "config" | "tasks" | "runs";

const TAB_PARAM = "tab";
const VALID_TABS: DetailTab[] = ["config", "tasks", "runs"];

function parseTab(value: string | null): DetailTab {
  return VALID_TABS.includes(value as DetailTab)
    ? (value as DetailTab)
    : "config";
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
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | undefined>();
  const [startingTaskIds, setStartingTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [runError, setRunError] = useState<string | null>(null);

  const [initialToast] = useState(
    () => (location.state as { toast?: string } | null)?.toast ?? null,
  );
  const { message: toastMessage, showToast } = useAgentsToast(initialToast);

  const { data, error, isLoading, refresh } = useFetchAgent(agentId);
  const {
    data: personaData,
    isLoading: personasLoading,
    refresh: refreshPersonas,
  } = useFetchPersonaVersions(agentId);
  const { data: groupsData, isLoading: groupsLoading } = useFetchGroups();
  const {
    data: tasksData,
    isLoading: tasksLoading,
    refresh: refreshTasks,
  } = useFetchTasks();
  const {
    runs: visibilityRuns,
    isLoading: runsLoading,
    suspendedRunIds,
  } = useRunsVisibility(true);
  const { connections } = useLiveConnections();

  const groups = groupsData?.groups;
  const knownGroupNames = useMemo(
    () => (groups ?? []).map((group) => group.name),
    [groups],
  );
  const agent = data?.agent;
  const serverNames = useMemo(() => {
    if (!agent) {
      return [] as string[];
    }
    const names = new Set<string>();
    for (const group of groups ?? []) {
      if (agent.groups.includes(group.name)) {
        for (const policy of group.servers) {
          names.add(policy.server);
        }
      }
    }
    return [...names].sort();
  }, [agent, groups]);
  const { catalogues, isLoading: cataloguesLoading } =
    useFetchServerCatalogues(serverNames);

  useEffect(() => {
    if (!initialToast) {
      return;
    }
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: null,
    });
  }, [initialToast, location.pathname, location.search, navigate]);

  const setTab = useCallback(
    (next: DetailTab) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (next === "config") {
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

  const agentTasks = useMemo(
    () => collectAgentTasks(tasksData?.tasks ?? [], agent?.id ?? ""),
    [agent?.id, tasksData?.tasks],
  );
  const agentRuns = useMemo(
    () => collectAgentRuns(visibilityRuns, agent?.id ?? ""),
    [agent?.id, visibilityRuns],
  );
  const unknownGroupCount = collectUnknownGroups(
    agent?.groups ?? [],
    knownGroupNames,
  ).length;
  const runningNow = isAgentRunning(agentRuns);
  const lastRun = latestRun(agentRuns);

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading agent…
      </div>
    );
  }

  if (error || !agent) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 text-muted-foreground"
          onClick={() => navigate(AGENTS_PATH)}
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

  const loaded = agent;
  const versions = personaData?.personas ?? [];

  async function handleSavePersona(content: string) {
    const nextVersion = loaded.currentPersonaVersion + 1;
    await updateAgent(loaded.id, { persona: content });
    await Promise.all([refresh(), refreshPersonas()]);
    await mutate(AGENTS_KEY);
    showToast(
      `Persona saved as v${nextVersion}. v${loaded.currentPersonaVersion} stays pinned to past runs.`,
    );
  }

  async function handleRestorePersona(version: {
    version: number;
    content: string;
  }) {
    const nextVersion = loaded.currentPersonaVersion + 1;
    await updateAgent(loaded.id, { persona: version.content });
    await Promise.all([refresh(), refreshPersonas()]);
    await mutate(AGENTS_KEY);
    showToast(`v${version.version} restored as v${nextVersion}.`);
  }

  async function handleChangeGroups(nextGroups: string[]) {
    await updateAgent(loaded.id, { groups: nextGroups });
    await refresh();
    await mutate(AGENTS_KEY);
  }

  async function handleDeleteConfirm() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteAgent(loaded.id);
      await mutate(AGENTS_KEY);
      void mutate(personaVersionsKey(loaded.id), undefined, {
        revalidate: false,
      });
      void mutate(agentGrantsKey(loaded.id), undefined, { revalidate: false });
      navigate(AGENTS_PATH);
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "Failed to delete agent",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRunTask(taskId: string) {
    setRunError(null);
    setStartingTaskIds((current) => {
      const next = new Set(current);
      next.add(taskId);
      return next;
    });
    try {
      const { runId } = await runSavedTask(taskId);
      void mutate(RUNS_VISIBILITY_KEY);
      void navigate(runDetailHref(runId));
    } catch (cause) {
      setRunError(
        cause instanceof Error ? cause.message : "Failed to start task",
      );
    } finally {
      setStartingTaskIds((current) => {
        const next = new Set(current);
        next.delete(taskId);
        return next;
      });
    }
  }

  function openNewTask() {
    setEditingTaskId(undefined);
    setTaskDialogOpen(true);
  }

  function openEditTask(taskId: string) {
    setEditingTaskId(taskId);
    setTaskDialogOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mb-3 -ml-2 text-muted-foreground"
        onClick={() => navigate(AGENTS_PATH)}
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
                  className="
                    gap-1.5 font-mono text-[11.5px] text-muted-foreground
                  "
                >
                  <Lock className="size-3" aria-hidden />
                  {agent.slug}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Immutable — this is what appears in traces
              </TooltipContent>
            </Tooltip>
            {runningNow ? (
              <span
                className="
                inline-flex items-center gap-1.5 rounded-full
                bg-[color-mix(in_srgb,var(--green-600)_16%,transparent)] px-2.5
                py-0.5 text-xs text-(--green-600)
              "
              >
                <span className="size-1.5 rounded-full bg-(--green-600)" />
                Running now
              </span>
            ) : null}
          </div>
          <div
            className="
            mt-1.5 flex flex-wrap items-center gap-3.5 text-[12.5px]
            text-muted-foreground
          "
          >
            <span className="font-mono">{agent.id}</span>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3" aria-hidden />
              Owned by{" "}
              <span className="font-mono text-foreground">{agent.ownerId}</span>
            </span>
            <span>
              Last run{" "}
              <span className="text-foreground">
                {lastRun ? formatRunRelative(lastRun.startedAt) : "never"}
              </span>
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openNewTask}
          >
            <Play className="size-3.5" aria-hidden />
            Run a task
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="
              text-destructive
              hover:text-destructive
            "
            onClick={() => setDeleteConfirmOpen(true)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Delete agent
          </Button>
        </div>
      </div>

      <div className="my-5 flex gap-1 border-b border-border">
        {(
          [
            { key: "config" as const, label: "Config", count: null },
            { key: "tasks" as const, label: "Tasks", count: agentTasks.length },
            { key: "runs" as const, label: "Runs", count: agentRuns.length },
          ] as const
        ).map((item) => {
          const isActive = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px]",
                isActive
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              {item.count !== null ? (
                <span className="font-mono text-[11.5px] text-muted-foreground">
                  {item.count}
                </span>
              ) : null}
              {item.key === "config" && unknownGroupCount > 0 ? (
                <span
                  className="size-1.5 rounded-full bg-amber-500"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {tab === "config" ? (
        <div className="flex flex-col gap-4">
          <AgentPersonaPanel
            agent={agent}
            versions={versions}
            versionsLoading={personasLoading}
            onSave={handleSavePersona}
            onRestore={handleRestorePersona}
          />
          <AgentGroupsPanel
            agent={agent}
            definedGroups={groups ?? []}
            groupsLoading={groupsLoading}
            onChangeGroups={handleChangeGroups}
            onNotify={showToast}
          />
          <AgentEffectiveToolsPanel
            membership={agent.groups}
            groups={groups ?? []}
            catalogues={catalogues}
            cataloguesLoading={cataloguesLoading}
            connections={connections}
          />
        </div>
      ) : null}

      {tab === "tasks" ? (
        <AgentTasksPanel
          tasks={agentTasks}
          runs={agentRuns}
          isLoading={tasksLoading}
          onNew={openNewTask}
          onEdit={openEditTask}
          onRun={(taskId) => void handleRunTask(taskId)}
          startingTaskIds={startingTaskIds}
          runError={runError}
        />
      ) : null}

      {tab === "runs" ? (
        <AgentRunsPanel
          runs={agentRuns}
          suspendedRunIds={suspendedRunIds}
          isLoading={runsLoading}
          onOpenRun={(runId) => navigate(runDetailHref(runId))}
        />
      ) : null}

      <TaskAuthoringDialog
        open={taskDialogOpen}
        onOpenChange={(open) => {
          setTaskDialogOpen(open);
          if (!open) {
            setEditingTaskId(undefined);
          }
        }}
        taskId={editingTaskId}
        defaultAssignee={editingTaskId ? undefined : agent.id}
        onTaskSaved={() => {
          void refreshTasks();
          void mutate(TASKS_KEY);
          void mutate(RUNS_VISIBILITY_KEY);
          showToast(
            editingTaskId ? "Task saved." : "Task created and run started.",
          );
        }}
      />

      <AgentsToast message={toastMessage} />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={handleDeleteConfirmOpenChange}
      >
        <DialogContent
          className="
          max-w-90
          sm:rounded-xl
        "
        >
          <DialogHeader>
            <DialogTitle>Delete agent?</DialogTitle>
            <DialogDescription>
              Delete {agent.name}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter
            className="
            gap-2
            sm:gap-0
          "
          >
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
