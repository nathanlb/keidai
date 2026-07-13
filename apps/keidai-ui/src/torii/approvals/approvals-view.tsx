import { Badge } from "@keidai/ui";
import { useCallback, useState } from "react";
import {
  approveApproval,
  cancelApproval,
  rejectApproval,
} from "../../shell/api/gateway-client.js";
import { useApprovals } from "../../shell/hooks/use-approvals.js";
import { ApprovalCard } from "./approval-card.js";
import { ApprovalsEmptyState } from "./approvals-empty-state.js";
import { RecentlyActioned } from "./recently-actioned.js";

export function ApprovalsView() {
  const { pending, recentlyActioned, pendingCount, isLoading, refresh } =
    useApprovals();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleApprove = useCallback(
    async (id: string) => {
      await approveApproval(id);
      await refresh();
      if (expandedId === id) {
        setExpandedId(null);
      }
    },
    [expandedId, refresh],
  );

  const handleReject = useCallback(
    async (id: string, reason?: string) => {
      await rejectApproval(id, reason);
      await refresh();
      if (expandedId === id) {
        setExpandedId(null);
      }
    },
    [expandedId, refresh],
  );

  const handleCancel = useCallback(
    async (id: string) => {
      await cancelApproval(id);
      await refresh();
      if (expandedId === id) {
        setExpandedId(null);
      }
    },
    [expandedId, refresh],
  );

  return (
    <div className="mx-auto w-full max-w-[840px]">
      {pendingCount > 0 ? (
        <div className="mb-4">
          <Badge variant="secondary" className="font-mono text-[11px]">
            {pendingCount} pending
          </Badge>
        </div>
      ) : null}

      {isLoading && pending.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Loading approvals…</p>
      ) : null}

      {!isLoading && pending.length === 0 ? <ApprovalsEmptyState /> : null}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-3">
          {pending.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              expanded={expandedId === approval.id}
              onToggle={() =>
                setExpandedId((current) =>
                  current === approval.id ? null : approval.id,
                )
              }
              onApprove={handleApprove}
              onReject={handleReject}
              onCancel={handleCancel}
            />
          ))}
        </div>
      ) : null}

      <RecentlyActioned items={recentlyActioned} />
    </div>
  );
}
