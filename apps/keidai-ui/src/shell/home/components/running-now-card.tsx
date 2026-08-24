import { Card, CardContent } from "@keidai/ui";
import { Link } from "react-router";
import { RUNS_PATH } from "../../navigation.js";
import { runDetailHref } from "../../../shaiden/navigation.js";
import type { HomeLiveRun } from "../types/home-digest.js";

export function RunningNowCard({ runs }: { runs: readonly HomeLiveRun[] }) {
  return (
    <Card className="overflow-hidden py-0 shadow-none">
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex items-center gap-2 border-b border-border px-4 py-[13px]">
          <span
            className="size-[7px] shrink-0 rounded-full bg-chart-1"
            aria-hidden
          />
          <span className="text-[13.5px] font-semibold">Running now</span>
          <Link
            to={RUNS_PATH}
            className="ml-auto text-[12.5px] text-muted-foreground no-underline hover:text-foreground"
          >
            All runs →
          </Link>
        </div>
        {runs.map((run) => (
          <Link
            key={run.id}
            to={runDetailHref(run.id)}
            className="border-b border-border px-4 py-[13px] no-underline transition-colors duration-150 ease-out hover:bg-[color-mix(in_srgb,var(--muted)_45%,transparent)] motion-reduce:transition-none"
          >
            <div className="flex items-baseline gap-[9px]">
              <span className="text-[13.5px] font-semibold text-foreground">
                {run.task}
              </span>
              <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                {run.agent}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11.5px] text-muted-foreground">
                {run.elapsedLabel}
              </span>
            </div>
            <div className="mt-[5px] text-xs text-muted-foreground">
              {run.stepText}
            </div>
            <div className="mt-2 flex items-center gap-[9px]">
              <div className="h-1 flex-1 overflow-hidden rounded-[3px] bg-muted">
                <div
                  className="h-full rounded-[3px] bg-chart-1"
                  style={{ width: `${run.progressPct}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {run.iterationLabel}
              </span>
            </div>
          </Link>
        ))}
        <div className="mt-auto px-4 py-[11px] text-xs text-muted-foreground">
          Live steps stream in as the agent works.
        </div>
      </CardContent>
    </Card>
  );
}
