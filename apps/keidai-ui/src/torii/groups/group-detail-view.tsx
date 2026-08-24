import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
} from "@keidai/ui";
import type { GroupServerPolicyView, GroupView } from "@keidai/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import { useSWRConfig } from "swr";
import { deleteGroup, updateGroup } from "../api/torii-client.js";
import { useFetchAgents } from "../../shell/hooks/use-fetch-agents.js";
import { useFetchServers } from "../../shell/hooks/use-fetch-servers.js";
import { useLiveConnections } from "../../shell/hooks/use-live-connections.js";
import { GROUPS_PATH } from "../../shell/navigation.js";
import { TORII_GROUPS_KEY } from "../../fuda/hooks/use-fetch-torii-groups.js";
import { AddServerButton } from "./components/add-server-button.js";
import { GroupAgentsRail } from "./components/group-agents-rail.js";
import { GroupServerCard } from "./components/group-server-card.js";
import { GroupsStatTiles } from "./components/groups-stat-tiles.js";
import { GroupsToast } from "./components/groups-toast.js";
import { HowThisResolves } from "./components/how-this-resolves.js";
import { GROUPS_KEY, useFetchGroups } from "./hooks/use-fetch-groups.js";
import { useFetchServerCatalogues } from "./hooks/use-fetch-server-catalogues.js";
import { useGroupsToast } from "./hooks/use-groups-toast.js";
import { agentsInGroup } from "./utils/collect-undefined-groups.js";
import { countGroupGrants } from "./utils/count-group-grants.js";
import { formatDeleteGroupConfirm } from "./utils/format-groups-copy.js";
import {
  addServerPolicy,
  removeServerPolicy,
  replaceServerPolicy,
} from "./utils/mutate-server-policy.js";

function cloneGroup(group: GroupView): GroupView {
  return {
    ...group,
    servers: group.servers.map((policy) => ({
      ...policy,
      allow: [...policy.allow],
      deny: [...policy.deny],
      gated: [...policy.gated],
    })),
  };
}

function samePolicy(
  a: GroupServerPolicyView,
  b: GroupServerPolicyView,
): boolean {
  return (
    a.server === b.server &&
    a.default === b.default &&
    a.allow.join("\0") === b.allow.join("\0") &&
    a.deny.join("\0") === b.deny.join("\0") &&
    a.gated.join("\0") === b.gated.join("\0")
  );
}

function isDirty(draft: GroupView, saved: GroupView): boolean {
  if (draft.description !== saved.description) {
    return true;
  }
  if (draft.servers.length !== saved.servers.length) {
    return true;
  }
  return draft.servers.some((policy, index) => {
    const original = saved.servers[index];
    return !original || !samePolicy(policy, original);
  });
}

export function GroupDetailView() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const { mutate } = useSWRConfig();
  const { data, error, isLoading, refresh } = useFetchGroups();
  const { data: agentsData } = useFetchAgents();
  const { data: serversData } = useFetchServers();
  const { connections } = useLiveConnections();
  const { message, showToast } = useGroupsToast();

  const saved = useMemo(
    () => data?.groups.find((group) => group.name === name) ?? null,
    [data, name],
  );
  const [draft, setDraft] = useState<GroupView | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!saved) {
      setDraft(null);
      return;
    }
    setDraft((current) => {
      if (current?.id === saved.id) {
        return current;
      }
      return cloneGroup(saved);
    });
  }, [saved]);

  const dirty = saved && draft ? isDirty(draft, saved) : false;
  const blocker = useBlocker(Boolean(dirty) && !isDeleting);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }
    const leave = window.confirm("Discard unsaved policy changes?");
    if (leave) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const agents = useMemo(() => agentsData?.agents ?? [], [agentsData]);
  const members = useMemo(
    () => (draft ? agentsInGroup(agents, draft.name) : []),
    [agents, draft],
  );

  const configuredServers = useMemo(
    () => (serversData?.servers ?? []).map((server) => server.name),
    [serversData],
  );
  const catalogueNames = useMemo(() => {
    const names = new Set(configuredServers);
    for (const policy of draft?.servers ?? []) {
      names.add(policy.server);
    }
    return [...names];
  }, [configuredServers, draft]);
  const { catalogues } = useFetchServerCatalogues(catalogueNames);

  const grants = useMemo(
    () => countGroupGrants(draft?.servers ?? [], catalogues),
    [catalogues, draft],
  );

  const remainingServers = configuredServers.filter(
    (server) => !draft?.servers.some((policy) => policy.server === server),
  );

  async function handleSave() {
    if (!draft || !dirty) {
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateGroup(draft.id, {
        description: draft.description,
        servers: draft.servers,
      });
      await refresh();
      await mutate(TORII_GROUPS_KEY);
      setDraft(cloneGroup(updated));
      showToast("Policy saved. Applies on the next tool call.");
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Could not save policy.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteGroup(draft.id);
      await mutate(GROUPS_KEY);
      await mutate(TORII_GROUPS_KEY);
      void navigate(GROUPS_PATH);
    } catch (caught) {
      setSaveError(
        caught instanceof Error ? caught.message : "Could not delete group.",
      );
      setIsDeleting(false);
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading group…
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        Could not load groups from Torii.
      </p>
    );
  }

  if (data && !saved) {
    return (
      <>
        <button
          type="button"
          onClick={() => navigate(GROUPS_PATH)}
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All groups
        </button>
        <p className="text-sm text-destructive">Group not found.</p>
      </>
    );
  }

  if (!draft) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading group…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={() => navigate(GROUPS_PATH)}
          className="mb-2.75 inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          All groups
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-mono text-[23px] font-bold tracking-tight">
              {draft.name}
            </div>
            <Input
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder="Add a description…"
              aria-label="Group description"
              className="mt-1 h-auto border-0 bg-transparent p-0 text-[13.5px] text-muted-foreground shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-8.5 text-[12.5px] text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              Delete group
            </Button>
            <Button
              type="button"
              className={
                dirty
                  ? "h-8.5 text-[12.5px]"
                  : "h-8.5 bg-muted text-[12.5px] text-muted-foreground opacity-75 hover:bg-muted"
              }
              disabled={!dirty || isSaving}
              onClick={() => void handleSave()}
            >
              {isSaving ? <Spinner className="size-3.5" aria-hidden /> : null}
              {dirty ? "Save policy" : "Saved"}
            </Button>
          </div>
        </div>
        {saveError ? (
          <p className="mt-2 text-sm text-destructive">{saveError}</p>
        ) : null}
      </div>

      <GroupsStatTiles
        servers={draft.servers.length}
        allowed={grants.allowed}
        gated={grants.gated}
        agents={members.length}
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(420px,1fr)_292px]">
        <div className="flex min-w-0 flex-col gap-3">
          {draft.servers.map((policy, index) => (
            <GroupServerCard
              key={policy.server}
              policy={policy}
              catalogue={catalogues[policy.server]}
              connectionState={connections.get(policy.server)?.state}
              defaultOpen={index === 0}
              onChange={(next) =>
                setDraft({
                  ...draft,
                  servers: replaceServerPolicy(draft.servers, next),
                })
              }
              onRemove={() =>
                setDraft({
                  ...draft,
                  servers: removeServerPolicy(draft.servers, policy.server),
                })
              }
            />
          ))}
          <AddServerButton
            servers={remainingServers}
            onAdd={(server) =>
              setDraft({
                ...draft,
                servers: addServerPolicy(draft.servers, server),
              })
            }
          />
        </div>
        <div className="flex flex-col gap-3">
          <GroupAgentsRail groupName={draft.name} agents={members} />
          <HowThisResolves />
        </div>
      </div>

      <GroupsToast message={message} />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-90 sm:rounded-xl">
          <DialogHeader>
            <DialogTitle>Delete group?</DialogTitle>
            <DialogDescription>
              Delete {draft.name}?{" "}
              {formatDeleteGroupConfirm(members.length, grants.allowed)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Keep group
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              Delete group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
