import type { ApprovalRecordView } from "@keidai/shared";
import useSWR from "swr";
import { fetchApprovals } from "../../torii/api/gateway-client.js";

export const APPROVALS_KEY = "approvals";

const RECENTLY_ACTIONED_LIMIT = 10;
const REFRESH_INTERVAL_MS = 3_000;

const swrOptions = {
  onError: () => undefined,
  refreshInterval: REFRESH_INTERVAL_MS,
} as const;

function sortByDecidedAtDesc(
  left: ApprovalRecordView,
  right: ApprovalRecordView,
): number {
  const leftTime = left.decidedAt ? Date.parse(left.decidedAt) : 0;
  const rightTime = right.decidedAt ? Date.parse(right.decidedAt) : 0;
  return rightTime - leftTime;
}

export function useApprovals() {
  const { data, error, isLoading, mutate } = useSWR(
    APPROVALS_KEY,
    () => fetchApprovals(),
    swrOptions,
  );

  const approvals = data ?? [];
  const pending = approvals.filter((record) => record.status === "pending");
  const recentlyActioned = approvals
    .filter((record) => record.status !== "pending")
    .sort(sortByDecidedAtDesc)
    .slice(0, RECENTLY_ACTIONED_LIMIT);

  return {
    pending,
    recentlyActioned,
    pendingCount: pending.length,
    error,
    isLoading,
    refresh: mutate,
  };
}

export function usePendingApprovalsCount() {
  const { pendingCount } = useApprovals();
  return pendingCount;
}
