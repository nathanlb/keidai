import type { ApprovalRecordView } from "@keidai/shared";
import { cn } from "@keidai/ui";
import { Ban, CheckCheck, X } from "lucide-react";
import { Link } from "react-router-dom";
import { TablePaginationFooter } from "../../shell/components/table-pagination/table-pagination-footer.js";
import { paginateItems } from "../../shell/components/table-pagination/paginate-items.js";
import { useTablePageIndex } from "../../shell/components/table-pagination/use-table-page-index.js";
import { parseNamespacedToolName } from "./utils/parse-namespaced-tool-name.js";

interface RecentlyActionedProps {
  items: ApprovalRecordView[];
  bufferCount: number;
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

export function RecentlyActioned({
  items,
  bufferCount,
}: RecentlyActionedProps) {
  const { pageIndex, onPageChange } = useTablePageIndex([items.length]);
  const {
    pageItems: pageItems,
    shownCount,
    canGoNewer,
    canGoOlder,
  } = paginateItems(items, pageIndex);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Recently actioned
      </h3>
      <ul className="mt-3 divide-y divide-border">
        {pageItems.map((item) => {
          const { server, tool } = parseNamespacedToolName(item.toolName);
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 py-3 opacity-75"
            >
              <OutcomeIcon status={item.status} />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[13px] font-semibold">
                      {tool}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {server}
                    </span>
                  </div>
                  {item.runId ? (
                    <Link
                      to={`/shaiden/runs?run=${encodeURIComponent(item.runId)}`}
                      className="block truncate font-mono text-[11px] text-primary hover:underline"
                      title={item.runId}
                      onClick={(event) => event.stopPropagation()}
                    >
                      run: {item.runId}
                    </Link>
                  ) : null}
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
      <TablePaginationFooter
        shownCount={shownCount}
        totalCount={bufferCount}
        totalLabel="approvals in buffer"
        canGoNewer={canGoNewer}
        canGoOlder={canGoOlder}
        onPageChange={onPageChange}
        pageIndex={pageIndex}
        className="mt-3 flex items-center justify-between rounded-lg border border-border px-4 py-2.5 text-xs text-muted-foreground"
      />
    </section>
  );
}
