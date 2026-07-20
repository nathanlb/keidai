import type { ApprovalDecidedNotificationParams } from "@keidai/shared";
import type { ApprovalDecision } from "../run/types/task-loop.js";

export interface ApprovalResumeSignal {
  waitForDecision(approvalId: string): Promise<ApprovalDecision>;
  dispose(): void;
}

export function createMcpNotificationApprovalResumeSignal(
  onNotification: (
    handler: (params: ApprovalDecidedNotificationParams) => void,
  ) => () => void,
  onSessionLost: () => void,
): ApprovalResumeSignal {
  const waiters = new Map<
    string,
    {
      resolve: (decision: ApprovalDecision) => void;
      reject: (error: Error) => void;
    }
  >();
  /** Decisions that arrived before waitForDecision registered a waiter. */
  const pendingDecisions = new Map<string, ApprovalDecision>();
  let disposed = false;

  const failPendingWaiters = (error: Error) => {
    for (const waiter of waiters.values()) {
      waiter.reject(error);
    }
    waiters.clear();
    pendingDecisions.clear();
  };

  const toDecision = (
    params: ApprovalDecidedNotificationParams,
  ): ApprovalDecision => ({
    status: params.status,
    reason: params.reason,
  });

  const unsubscribe = onNotification((params) => {
    if (disposed) {
      return;
    }
    const decision = toDecision(params);
    const waiter = waiters.get(params.approval_id);
    if (waiter) {
      waiters.delete(params.approval_id);
      waiter.resolve(decision);
      return;
    }
    pendingDecisions.set(params.approval_id, decision);
  });

  return {
    waitForDecision(approvalId: string) {
      if (disposed) {
        return Promise.reject(
          new Error("MCP session closed while waiting for approval"),
        );
      }
      const buffered = pendingDecisions.get(approvalId);
      if (buffered) {
        pendingDecisions.delete(approvalId);
        return Promise.resolve(buffered);
      }
      return new Promise<ApprovalDecision>((resolve, reject) => {
        waiters.set(approvalId, { resolve, reject });
      });
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      unsubscribe();
      failPendingWaiters(
        new Error("MCP session closed while waiting for approval"),
      );
      onSessionLost();
    },
  };
}
