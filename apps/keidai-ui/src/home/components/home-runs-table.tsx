import { Card, cn } from "@keidai/ui";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { RUNS_PATH, TASKS_PATH } from "../../shell/navigation.js";
import { runDetailHref } from "../../runs/navigation.js";
import type { HomeRecentRun, HomeScheduledTask } from "../types/home-digest.js";
import { verdictLabel } from "../utils/derive-goal-verdict.js";
import {
  formatRecentFooter,
  formatScheduledFooter,
} from "../utils/format-home-copy.js";
import { scheduledTaskHref } from "../utils/build-home-digest.js";
import { verdictDotClass, verdictTextClass } from "../utils/verdict-classes.js";

export type HomeRunsTab = "recent" | "scheduled";

const gridClassName =
  "grid grid-cols-[1.5fr_.9fr_.9fr_.6fr_.5fr_18px] items-center gap-3 px-4";

const headerClassName =
  "border-b border-border py-[9px] text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase";

const rowClassName =
  "border-b border-border py-[11px] no-underline transition-colors duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--muted)_45%,transparent)] motion-reduce:transition-none";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        `
          -mb-px border-b-2 pt-3.5 pb-3 text-[13.5px] transition-colors
          duration-150 ease-out
          motion-reduce:transition-none
        `,
        active
          ? "border-foreground font-semibold text-foreground"
          : `
            border-transparent font-medium text-muted-foreground
            hover:text-foreground
          `,
      )}
    >
      {children}
    </button>
  );
}

function RecentRows({ rows }: { rows: readonly HomeRecentRun[] }) {
  return (
    <>
      <div className={cn(gridClassName, headerClassName)}>
        <span>Run</span>
        <span>Agent</span>
        <span>Goal</span>
        <span className="text-right">Duration</span>
        <span className="text-right">When</span>
        <span />
      </div>
      {rows.map((row) => (
        <Link
          key={row.id}
          to={runDetailHref(row.id)}
          className={cn(gridClassName, rowClassName)}
        >
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium text-foreground">
              {row.task}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {row.id}
            </div>
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {row.agent}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[12.5px] font-medium",
              verdictTextClass(row.verdict),
            )}
          >
            <span
              className={cn(
                "size-1.75 shrink-0 rounded-full",
                verdictDotClass(row.verdict),
              )}
              aria-hidden
            />
            {verdictLabel(row.verdict)}
          </span>
          <span className="text-right font-mono text-xs text-muted-foreground">
            {row.durationLabel}
          </span>
          <span className="text-right font-mono text-xs text-muted-foreground">
            {row.whenLabel}
          </span>
          <ChevronRight
            className="size-3.75 text-muted-foreground"
            aria-hidden
          />
        </Link>
      ))}
    </>
  );
}

function ScheduledRows({ rows }: { rows: readonly HomeScheduledTask[] }) {
  return (
    <>
      <div className={cn(gridClassName, headerClassName)}>
        <span>Task</span>
        <span>Agent</span>
        <span>Trigger</span>
        <span className="text-right">Last goal</span>
        <span className="text-right">Next</span>
        <span />
      </div>
      {rows.map((row) => (
        <Link
          key={row.id}
          to={scheduledTaskHref(row.id)}
          className={cn(gridClassName, rowClassName)}
        >
          <div className="flex min-w-0 items-center gap-2.25">
            <span
              className={cn(
                "size-1.75 shrink-0 rounded-full",
                row.paused
                  ? "bg-muted-foreground"
                  : row.failed
                    ? "bg-destructive"
                    : row.lastVerdict
                      ? verdictDotClass(row.lastVerdict)
                      : "bg-(--green-600)",
              )}
              aria-hidden
            />
            <div className="min-w-0">
              <div className="
                truncate text-[13.5px] font-medium text-foreground
              ">
                {row.task}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {row.description}
              </div>
            </div>
          </div>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {row.agent}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {row.trigger}
          </span>
          <span
            className={cn(
              "text-right text-[12.5px]",
              row.lastVerdict
                ? verdictTextClass(row.lastVerdict)
                : "text-muted-foreground",
            )}
          >
            {row.lastVerdict ? verdictLabel(row.lastVerdict) : "—"}
          </span>
          <span
            className={cn(
              "text-right font-mono text-xs",
              row.paused || row.failed
                ? "text-muted-foreground"
                : "text-foreground",
            )}
          >
            {row.nextLabel}
          </span>
          <ChevronRight
            className="size-3.75 text-muted-foreground"
            aria-hidden
          />
        </Link>
      ))}
    </>
  );
}

export function HomeRunsTable({
  tab,
  onTabChange,
  recent,
  totalRunCount,
  scheduled,
  pausedScheduledCount,
}: {
  tab: HomeRunsTab;
  onTabChange: (tab: HomeRunsTab) => void;
  recent: readonly HomeRecentRun[];
  totalRunCount: number;
  scheduled: readonly HomeScheduledTask[];
  pausedScheduledCount: number;
}) {
  const isRecent = tab === "recent";

  return (
    <Card
      data-testid="home-runs-table"
      className="gap-0 overflow-hidden py-0 shadow-none"
    >
      <div className="
        flex items-center gap-4 overflow-x-auto border-b border-border px-4
      ">
        <TabButton active={isRecent} onClick={() => onTabChange("recent")}>
          Recent
        </TabButton>
        <TabButton active={!isRecent} onClick={() => onTabChange("scheduled")}>
          <span className="flex items-center gap-1.75">
            Scheduled
            <span className="
              font-mono text-[11px] font-normal text-muted-foreground
            ">
              {scheduled.length}
            </span>
          </span>
        </TabButton>
        <Link
          to={isRecent ? RUNS_PATH : TASKS_PATH}
          className="
            ml-auto shrink-0 text-[12.5px] text-muted-foreground no-underline
            hover:text-foreground
          "
        >
          {isRecent ? "All runs →" : "All tasks →"}
        </Link>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-180">
          {isRecent ? (
            <RecentRows rows={recent} />
          ) : (
            <ScheduledRows rows={scheduled} />
          )}
        </div>
      </div>
      <div className="px-4 py-2.75 text-xs text-muted-foreground">
        {isRecent
          ? formatRecentFooter(recent.length, totalRunCount)
          : formatScheduledFooter(
              scheduled.length,
              pausedScheduledCount,
              scheduled.filter((row) => row.failed).length,
            )}
      </div>
    </Card>
  );
}
