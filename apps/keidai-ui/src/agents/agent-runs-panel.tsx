import { Spinner, cn } from "@keidai/ui";
import type { RunListItem } from "@keidai/shared";
import { useMemo, useState } from "react";
import { formatCompactDurationSince } from "../home/utils/format-compact-duration.js";
import { deriveGoalVerdict } from "../home/utils/derive-goal-verdict.js";
import { deriveRunDisplayStatus } from "../runs/utils/derive-run-display-status.js";
import { RUN_STATUS_META } from "../runs/utils/format-run-status.js";
import { formatRunRelative } from "../runs/utils/format-run-time.js";
import { GoalVerdictPill } from "./components/goal-verdict-pill.js";
import { SegmentedFilter } from "./components/segmented-filter.js";
import {
  SEVEN_DAYS_MS,
  countVerdicts,
  runsSince,
} from "./utils/agent-activity.js";

type RunVerdictFilter = "all" | "met" | "partial" | "missed";

function exitLabel(
  run: RunListItem,
  suspendedRunIds: ReadonlySet<string>,
): { text: string; className: string } {
  const status = deriveRunDisplayStatus(run, { suspendedRunIds });
  if (status === "goal_met") {
    return { text: "Completed", className: "text-foreground" };
  }
  const meta = RUN_STATUS_META[status];
  const className =
    status === "failed" || status === "human_reject"
      ? "text-destructive"
      : status === "waiting_approval" || status === "timeout"
        ? "text-amber-500"
        : "text-muted-foreground";
  return { text: meta.label, className };
}

function StatTile({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-[15px] py-3.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={cn("size-1.75 rounded-full", dotClass)} aria-hidden />
        {label}
      </div>
      <div className="mt-1.5 text-[22px] leading-none font-bold tracking-tight">
        {value}
      </div>
    </div>
  );
}

export function AgentRunsPanel({
  runs,
  suspendedRunIds,
  isLoading,
  onOpenRun,
}: {
  runs: readonly RunListItem[];
  suspendedRunIds: ReadonlySet<string>;
  isLoading: boolean;
  onOpenRun: (runId: string) => void;
}) {
  const [filter, setFilter] = useState<RunVerdictFilter>("all");
  const now = Date.now();
  const recent = useMemo(
    () => runsSince(runs, now - SEVEN_DAYS_MS),
    [now, runs],
  );
  const counts = useMemo(() => countVerdicts(recent), [recent]);
  const visible = useMemo(() => {
    if (filter === "all") {
      return recent;
    }
    return recent.filter((run) => deriveGoalVerdict(run) === filter);
  }, [filter, recent]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" aria-hidden />
        Loading runs…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Runs (7d)"
          value={recent.length}
          dotClass="bg-muted-foreground"
        />
        <StatTile
          label="Goal met"
          value={counts.met}
          dotClass="bg-(--green-600)"
        />
        <StatTile
          label="Partial"
          value={counts.partial}
          dotClass="bg-amber-500"
        />
        <StatTile
          label="Missed"
          value={counts.missed}
          dotClass="bg-destructive"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-3">
          <div className="text-[13.5px] font-semibold">
            Runs{" "}
            <span className="font-mono font-medium text-muted-foreground">
              last 7 days
            </span>
          </div>
          <SegmentedFilter
            ariaLabel="Filter runs by goal verdict"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: recent.length },
              { value: "met", label: "Met", count: counts.met },
              { value: "partial", label: "Partial", count: counts.partial },
              { value: "missed", label: "Missed", count: counts.missed },
            ]}
          />
        </div>

        {visible.length === 0 ? (
          <p className="px-[18px] py-4 text-[12.5px] text-muted-foreground">
            {runs.length === 0
              ? "No runs yet."
              : "No runs in this filter for the last 7 days."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-[106px_1.4fr_.8fr_78px_.95fr_.95fr] gap-3.5 border-b border-border px-[18px] py-2.5 text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              <span>Run</span>
              <span>Task</span>
              <span>Started</span>
              <span>Took</span>
              <span>Exit status</span>
              <span>Goal verdict</span>
            </div>
            {visible.map((run) => {
              const exit = exitLabel(run, suspendedRunIds);
              const displayStatus = deriveRunDisplayStatus(run, {
                suspendedRunIds,
              });
              const verdict = deriveGoalVerdict(run);
              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onOpenRun(run.id)}
                  className="grid w-full grid-cols-[106px_1.4fr_.8fr_78px_.95fr_.95fr] items-center gap-3.5 border-b border-border px-[18px] py-3 text-left last:border-b-0 hover:bg-muted/45"
                >
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {run.id}
                  </span>
                  <span className="min-w-0 truncate text-[12.5px]">
                    {run.goalPreview}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {formatRunRelative(run.startedAt)}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {run.status === "running"
                      ? formatCompactDurationSince(run.startedAt, now)
                      : "—"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs",
                      exit.className,
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        displayStatus === "failed" ||
                          displayStatus === "human_reject"
                          ? "bg-destructive"
                          : "bg-current",
                      )}
                      aria-hidden
                    />
                    {exit.text}
                  </span>
                  <span className="justify-self-start">
                    <GoalVerdictPill verdict={verdict} />
                  </span>
                </button>
              );
            })}
          </>
        )}
        <p className="px-[18px] py-2.5 text-[11.5px] leading-normal text-muted-foreground">
          Exit status is whether the run finished. Goal verdict is whether it did
          the thing — a run can complete cleanly and still miss its goal.
        </p>
      </div>
    </div>
  );
}
