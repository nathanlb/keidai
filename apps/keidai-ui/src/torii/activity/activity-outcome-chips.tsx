import { Badge, cn } from "@keidai/ui";
import {
  TRACE_OUTCOME_META,
  type OutcomeFilter,
} from "./utils/format-trace-outcome.js";
import type { OutcomeCounts } from "./utils/count-trace-outcomes.js";

const OUTCOME_CHIP_ORDER = [
  "all",
  "success",
  "error",
  "denied",
  "linking_required",
] as const satisfies readonly OutcomeFilter[];

function chipLabel(filter: OutcomeFilter): string {
  if (filter === "all") {
    return "all";
  }
  return TRACE_OUTCOME_META[filter].label;
}

export function ActivityOutcomeChips({
  counts,
  active,
  onChange,
}: {
  counts: OutcomeCounts;
  active: OutcomeFilter;
  onChange: (outcome: OutcomeFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {OUTCOME_CHIP_ORDER.map((filter) => {
        const isActive = active === filter;
        const meta =
          filter === "all" ? undefined : TRACE_OUTCOME_META[filter];

        return (
          <button
            key={filter}
            type="button"
            onClick={() => onChange(filter)}
            className={cn(
              "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors",
              isActive
                ? "border-foreground/20 bg-secondary font-medium text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40",
            )}
          >
            {meta?.dotClass ? (
              <span
                className={cn("size-1.5 rounded-full", meta.dotClass)}
                aria-hidden
              />
            ) : null}
            {chipLabel(filter)}
            <Badge
              variant="secondary"
              className="h-4 px-1.5 font-mono text-[11px] font-normal text-muted-foreground"
            >
              {counts[filter]}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
