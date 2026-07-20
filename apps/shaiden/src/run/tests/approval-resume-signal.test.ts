import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPROVAL_DECIDED_NOTIFICATION_METHOD,
  type ApprovalDecidedNotificationParams,
} from "@keidai/shared";
import { createMcpNotificationApprovalResumeSignal } from "../approval-resume-signal.js";

describe("createMcpNotificationApprovalResumeSignal", () => {
  it("resolves waiters when a matching notification arrives", async () => {
    let handler: ((params: ApprovalDecidedNotificationParams) => void) | undefined;
    const signal = createMcpNotificationApprovalResumeSignal(
      (nextHandler) => {
        handler = nextHandler;
        return () => {
          handler = undefined;
        };
      },
      () => {},
    );

    const decisionPromise = signal.waitForDecision("approval-1");
    handler?.({
      approval_id: "approval-1",
      status: "approved",
    });

    const decision = await decisionPromise;
    assert.equal(decision.status, "approved");
    signal.dispose();
  });

  it("resolves from a notification that arrived before waitForDecision", async () => {
    let handler: ((params: ApprovalDecidedNotificationParams) => void) | undefined;
    const signal = createMcpNotificationApprovalResumeSignal(
      (nextHandler) => {
        handler = nextHandler;
        return () => {
          handler = undefined;
        };
      },
      () => {},
    );

    handler?.({
      approval_id: "approval-1",
      status: "rejected",
      reason: "too late",
    });

    await assert.deepEqual(await signal.waitForDecision("approval-1"), {
      status: "rejected",
      reason: "too late",
    });
    signal.dispose();
  });

  it("rejects pending waiters when the session is disposed", async () => {
    const signal = createMcpNotificationApprovalResumeSignal(
      () => () => {},
      () => {},
    );

    const decisionPromise = signal.waitForDecision("approval-1");
    signal.dispose();

    await assert.rejects(
      decisionPromise,
      /MCP session closed while waiting for approval/,
    );
  });

  it("ignores notifications for other approval ids", async () => {
    let handler: ((params: ApprovalDecidedNotificationParams) => void) | undefined;
    const signal = createMcpNotificationApprovalResumeSignal(
      (nextHandler) => {
        handler = nextHandler;
        return () => {
          handler = undefined;
        };
      },
      () => {},
    );

    const decisionPromise = signal.waitForDecision("approval-1");
    handler?.({
      approval_id: "approval-2",
      status: "approved",
    });

    let settled = false;
    void decisionPromise.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(settled, false);

    handler?.({
      approval_id: "approval-1",
      status: "rejected",
      reason: "not now",
    });

    await assert.deepEqual(await decisionPromise, {
      status: "rejected",
      reason: "not now",
    });
    signal.dispose();
  });

  it("uses the shared notification method constant", () => {
    assert.equal(
      APPROVAL_DECIDED_NOTIFICATION_METHOD,
      "notifications/approval_decided",
    );
  });
});
