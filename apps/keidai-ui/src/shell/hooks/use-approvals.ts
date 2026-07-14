import type { ApprovalRecordView } from "@keidai/shared";
import useSWR from "swr";
import { LIST_BUFFER_LIMIT } from "../constants/list-limits.js";
import { fetchApprovals } from "../../torii/api/torii-client.js";

export const APPROVALS_KEY = "approvals";

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
    () => fetchApprovals({ limit: LIST_BUFFER_LIMIT }),
    swrOptions,
  );

  const approvals = data ?? [];
  const pending = approvals.filter((record) => record.status === "pending");
  const recentlyActioned = approvals
    .filter((record) => record.status !== "pending")
    .sort(sortByDecidedAtDesc);

  return {
    pending,
    recentlyActioned,
    bufferCount: approvals.length,
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
