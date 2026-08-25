import { Badge, Button, cn, Spinner, Textarea } from "@keidai/ui";
import { Check, History, RotateCw } from "lucide-react";
import { useState } from "react";
import type { ManagementAgent, PersonaVersion } from "../lib/api/agents.js";
import { formatRelativeTime } from "./utils/format-relative-time.js";

export interface AgentPersonaPanelProps {
  agent: ManagementAgent;
  versions: PersonaVersion[];
  versionsLoading: boolean;
  onSave: (content: string) => Promise<void>;
  onRestore: (version: PersonaVersion) => Promise<void>;
}

export function AgentPersonaPanel({
  agent,
  versions,
  versionsLoading,
  onSave,
  onRestore,
}: AgentPersonaPanelProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const personaSyncKey = `${agent.currentPersonaVersion}\0${agent.persona}`;
  const [draftSyncKey, setDraftSyncKey] = useState(personaSyncKey);
  const [draft, setDraft] = useState(agent.persona);
  const [isSaving, setIsSaving] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  if (personaSyncKey !== draftSyncKey) {
    setDraftSyncKey(personaSyncKey);
    setDraft(agent.persona);
  }

  const viewing =
    selectedVersion !== null
      ? versions.find((version) => version.version === selectedVersion)
      : null;
  const dirty = draft !== agent.persona;

  async function handleSave() {
    setIsSaving(true);
    try {
      await onSave(draft);
      setSelectedVersion(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRestore() {
    if (!viewing) {
      return;
    }
    setIsRestoring(true);
    try {
      await onRestore(viewing);
      setSelectedVersion(null);
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <div
      className="
      grid items-start gap-5
      lg:grid-cols-[minmax(0,1fr)_296px]
    "
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div
          className="
          flex items-center justify-between gap-3 border-b border-border
          px-[18px] py-3.5
        "
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {viewing
                ? `Persona · v${viewing.version}`
                : `Persona · v${agent.currentPersonaVersion}`}
              {viewing ? (
                <Badge
                  variant="outline"
                  className="
                  text-[10.5px] text-muted-foreground
                "
                >
                  Read-only
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10.5px]">
                  Current
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {viewing
                ? `Saved ${formatRelativeTime(viewing.createdAt)}`
                : `Editing the current version. ${versions.length || 1} version${
                    (versions.length || 1) === 1 ? "" : "s"
                  } total.`}
            </div>
          </div>
          {viewing ? (
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedVersion(null)}
              >
                Back to current
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isRestoring}
                onClick={() => void handleRestore()}
              >
                {isRestoring ? (
                  <Spinner className="size-3.5" aria-hidden />
                ) : (
                  <RotateCw className="size-3.5" aria-hidden />
                )}
                Restore as new version
              </Button>
            </div>
          ) : null}
        </div>

        {viewing ? (
          <div className="px-[18px] py-4 text-[13.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {viewing.content}
          </div>
        ) : (
          <div className="px-4.5 py-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-67.5 text-[13.5px] leading-relaxed"
            />
          </div>
        )}

        <div
          className="
          flex items-center justify-between gap-3 border-t border-border
          px-[18px] py-3
        "
        >
          <div className="text-xs/normal text-muted-foreground">
            {viewing
              ? "Pinned to — completed runs. Versions are append-only, so those traces stay interpretable."
              : dirty
                ? `Saving appends v${agent.currentPersonaVersion + 1}. v${agent.currentPersonaVersion} is kept so existing traces stay interpretable.`
                : "No unsaved changes."}
          </div>
          {!viewing ? (
            <div className="flex shrink-0 gap-2">
              {dirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setDraft(agent.persona)}
                >
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={!dirty || isSaving}
                onClick={() => void handleSave()}
              >
                {isSaving ? <Spinner className="size-3.5" aria-hidden /> : null}
                {dirty
                  ? `Save as v${agent.currentPersonaVersion + 1}`
                  : "Saved"}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div
          className="
          flex items-center gap-2 border-b border-border px-[15px] py-3
        "
        >
          <History className="size-3.5 text-muted-foreground" aria-hidden />
          <div className="text-[13px] font-semibold">Version history</div>
          <span
            className="
            ml-auto font-mono text-[11.5px] text-muted-foreground
          "
          >
            {versionsLoading ? "…" : `${versions.length} versions`}
          </span>
        </div>
        <div className="flex flex-col">
          {versions.map((version) => {
            const isCurrent = version.version === agent.currentPersonaVersion;
            const isActive =
              (selectedVersion === null && isCurrent) ||
              selectedVersion === version.version;
            return (
              <button
                type="button"
                key={version.version}
                onClick={() =>
                  setSelectedVersion(isCurrent ? null : version.version)
                }
                className={cn(
                  "flex items-start gap-2.5 border-b border-border px-[15px] py-2.5 text-left hover:bg-muted/30",
                  isActive && "bg-muted/45",
                )}
              >
                <span
                  className={
                    "w-6.5 shrink-0 font-mono text-xs font-semibold " +
                    (isCurrent ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  v{version.version}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {formatRelativeTime(version.createdAt)}
                  </div>
                </div>
                {isCurrent ? (
                  <Check
                    className="mt-0.5 size-3.5 shrink-0 text-(--green-600)"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
        <div
          className="
          px-[15px] py-2.5 text-[11.5px] leading-normal text-muted-foreground
        "
        >
          Editing never overwrites. Each save appends a version and moves the
          pointer.
        </div>
      </div>
    </div>
  );
}
