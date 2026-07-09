import { Badge, cn } from "@keidai/ui";
import type { RunStatusFilter } from "./utils/derive-run-display-status.js";
import type { RunStatusCounts } from "./utils/count-run-statuses.js";
import {
  RUN_STATUS_CHIP_ORDER,
  runStatusChipDotClass,
  runStatusChipLabel,
} from "./utils/format-run-status.js";

export function RunsStatusChips({
  counts,
  active,
  onChange,
}: {
  counts: RunStatusCounts;
  active: RunStatusFilter;
  onChange: (status: RunStatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RUN_STATUS_CHIP_ORDER.map((filter) => {
        const isActive = active === filter;
        const dotClass = runStatusChipDotClass(filter);

        return (
          <button
            key={filter}
            type="button"
            onClick={() => onChange(filter)}
            className={cn(
              "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[12.5px] transition-colors",
              isActive
                ? "border-foreground/20 bg-accent font-semibold text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40",
            )}
          >
            {dotClass ? (
              <span
                className={cn("size-1.5 rounded-full", dotClass)}
                aria-hidden
              />
            ) : null}
            {runStatusChipLabel(filter)}
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
