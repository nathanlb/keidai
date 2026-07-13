import type { ApprovalRecordView } from "@keidai/shared";

export interface ApprovalDecision {
  status: "approved" | "rejected" | "cancelled";
  reason?: string;
}

export function toriiBaseUrlFromMcpUrl(toriiMcpUrl: string): string {
  const url = new URL(toriiMcpUrl);
  url.pathname = url.pathname.replace(/\/mcp\/?$/, "") || "/";
  return url.origin + (url.pathname === "/" ? "" : url.pathname);
}

export async function fetchApproval(
  baseUrl: string,
  approvalId: string,
): Promise<ApprovalRecordView | undefined> {
  const response = await fetch(`${baseUrl}/api/approvals/${approvalId}`);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`failed to fetch approval ${approvalId}: ${response.status}`);
  }
  return (await response.json()) as ApprovalRecordView;
}

export async function pollApprovalDecision(
  baseUrl: string,
  approvalId: string,
  options?: {
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<ApprovalDecision> {
  const intervalMs = options?.intervalMs ?? 250;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  while (true) {
    const approval = await fetchApproval(baseUrl, approvalId);
    if (!approval) {
      throw new Error(`approval ${approvalId} not found`);
    }

    if (approval.status === "approved") {
      return { status: "approved" };
    }
    if (approval.status === "rejected") {
      return {
        status: "rejected",
        reason: approval.rejectionReason,
      };
    }
    if (approval.status === "cancelled") {
      return { status: "cancelled" };
    }

    await sleep(intervalMs);
  }
}
