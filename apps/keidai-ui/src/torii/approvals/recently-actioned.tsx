import type { ApprovalRecordView } from "@keidai/shared";
import { cn } from "@keidai/ui";
import { Ban, CheckCheck, X } from "lucide-react";
import { parseNamespacedToolName } from "./utils/parse-namespaced-tool-name.js";

interface RecentlyActionedProps {
  items: ApprovalRecordView[];
}

function outcomeLabel(status: ApprovalRecordView["status"]): string {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Denied";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function OutcomeIcon({ status }: { status: ApprovalRecordView["status"] }) {
  switch (status) {
    case "approved":
      return <CheckCheck className="size-4 text-success" />;
    case "rejected":
      return <X className="size-4 text-destructive" />;
    case "cancelled":
      return <Ban className="size-4 text-muted-foreground" />;
    default:
      return null;
  }
}

export function RecentlyActioned({ items }: RecentlyActionedProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Recently actioned
      </h3>
      <ul className="mt-3 divide-y divide-border">
        {items.map((item) => {
          const { server, tool } = parseNamespacedToolName(item.toolName);
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 py-3 opacity-75"
            >
              <OutcomeIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[13px] font-semibold">{tool}</span>
                  <span className="text-[12px] text-muted-foreground">{server}</span>
                </div>
                {item.rejectionReason ? (
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {item.rejectionReason}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 text-[12px] font-medium",
                  item.status === "approved" && "text-success",
                  item.status === "rejected" && "text-destructive",
                  item.status === "cancelled" && "text-muted-foreground",
                )}
              >
                {outcomeLabel(item.status)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
