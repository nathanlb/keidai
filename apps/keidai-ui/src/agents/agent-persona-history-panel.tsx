import { Button, cn, Spinner } from "@keidai/ui";
import { Check, History, RotateCw } from "lucide-react";
import { useState } from "react";
import type { ManagementAgent, PersonaVersion } from "../lib/api/agents.js";
import { formatRelativeTime } from "./utils/format-relative-time.js";

export interface AgentPersonaHistoryPanelProps {
  agent: ManagementAgent;
  versions: PersonaVersion[];
  versionsLoading: boolean;
  onRestore: (version: PersonaVersion) => Promise<void>;
}

/** Persona is edited in the agent form. This lists past versions and restores one. */
export function AgentPersonaHistoryPanel({
  agent,
  versions,
  versionsLoading,
  onRestore,
}: AgentPersonaHistoryPanelProps) {
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const viewing =
    selectedVersion !== null
      ? (versions.find((version) => version.version === selectedVersion) ??
        null)
      : null;

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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div
        className="
        flex items-center gap-2 border-b border-border px-3.75 py-3
      "
      >
        <History className="size-3.5 text-muted-foreground" aria-hidden />
        <div className="text-[13px] font-semibold">Persona history</div>
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
          const isActive = selectedVersion === version.version;
          return (
            <button
              type="button"
              key={version.version}
              onClick={() =>
                setSelectedVersion(
                  isCurrent || isActive ? null : version.version,
                )
              }
              className={cn(
                "flex items-start gap-2.5 border-b border-border px-3.75 py-2.5 text-left hover:bg-muted/30",
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
              <div className="min-w-0 flex-1 font-mono text-[11px] text-muted-foreground">
                {formatRelativeTime(version.createdAt)}
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
      {viewing ? (
        <div className="border-b border-border px-3.75 py-3">
          <div className="mb-2 text-xs text-muted-foreground">
            v{viewing.version} · read-only
          </div>
          <div className="max-h-60 overflow-y-auto text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {viewing.content}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={isRestoring}
            onClick={() => void handleRestore()}
          >
            {isRestoring ? (
              <Spinner className="size-3.5" aria-hidden />
            ) : (
              <RotateCw className="size-3.5" aria-hidden />
            )}
            Restore as v{agent.currentPersonaVersion + 1}
          </Button>
        </div>
      ) : null}
      <div
        className="
        px-3.75 py-2.5 text-[11.5px] leading-normal text-muted-foreground
      "
      >
        Editing never overwrites. Each save appends a version and moves the
        pointer.
      </div>
    </div>
  );
}
