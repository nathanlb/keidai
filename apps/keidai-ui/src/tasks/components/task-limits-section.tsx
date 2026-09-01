import { Badge } from "@keidai/ui";
import { DEFAULT_TASK_LIMITS } from "@keidai/shared";
import { Lock, Repeat, SlidersHorizontal, Timer } from "lucide-react";
import { FieldHeader } from "./field-header.js";

const WALL_CLOCK_MINUTES = DEFAULT_TASK_LIMITS.timeout_seconds / 60;

export function TaskLimitsSection() {
  return (
    <section className="py-5">
      <FieldHeader
        icon={<SlidersHorizontal className="size-3.5" aria-hidden />}
        label="Limits"
        badge={
          <Badge
            variant="secondary"
            className="gap-1.5 text-[10.5px] font-normal"
          >
            <Lock className="size-3" aria-hidden />
            Defaults · locked in v0
          </Badge>
        }
      />
      <p
        className="
          mt-1 mb-2.5 text-[12.5px] leading-normal text-muted-foreground
        "
      >
        A run terminates <span className="font-mono">iteration_exhausted</span>{" "}
        or <span className="font-mono">timeout</span> if it hits these.
      </p>
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-xs text-muted-foreground">
            Iteration cap
          </div>
          <div
            className="
              flex items-center gap-2.5 rounded-md border border-border
              bg-muted px-3 py-2.5 opacity-75
            "
          >
            <Repeat
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="font-mono text-[13.5px] font-semibold">
              {DEFAULT_TASK_LIMITS.max_iterations}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              iterations
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 text-xs text-muted-foreground">
            Wall-clock timeout
          </div>
          <div
            className="
              flex items-center gap-2.5 rounded-md border border-border
              bg-muted px-3 py-2.5 opacity-75
            "
          >
            <Timer
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="font-mono text-[13.5px] font-semibold">
              {WALL_CLOCK_MINUTES}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              minutes
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
