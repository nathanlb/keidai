import { cn } from "@keidai/ui";
import { usePendingApprovalsCount } from "../../hooks/use-approvals.js";

export function ApprovalsPendingFooter() {
  const pendingCount = usePendingApprovalsCount();

  if (pendingCount === 0) {
    return null;
  }

  return (
    <div className="mx-2 border-t border-sidebar-border px-2.5 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full bg-amber-500"
          aria-hidden
        />
        <div className="min-w-0 leading-snug">
          <div className="text-[12.5px] font-semibold text-sidebar-foreground">
            {pendingCount} awaiting review
          </div>
          <div className="text-[11px] text-muted-foreground">sourced from Torii</div>
        </div>
      </div>
    </div>
  );
}

interface NavPendingBadgeProps {
  count: number;
}

export function NavPendingBadge({ count }: NavPendingBadgeProps) {
  if (count === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-[19px] items-center justify-center rounded-full",
        "bg-amber-500 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-950",
      )}
    >
      {count}
    </span>
  );
}
