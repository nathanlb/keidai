/**
 * Live harness evals: real Torii MCP, real model, real tool dispatch.
 *
 * Requires OPEN_ROUTER_API_KEY. Boots an in-process Torii gateway with mock MCP
 * backends so tool payloads are deterministic while the harness path is production-faithful.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Task } from "@keidai/shared";
import {
  assertNotGoalMet,
  assertOutcome,
} from "../../helpers/assert-outcome.js";
import { runLiveHarnessEval } from "../../helpers/live-harness.js";
import { startEvalToriiStack } from "../../helpers/torii-eval-stack.js";

const LIVE_EVAL_TIMEOUT_MS = 180_000;

const REGRESSION_TASK_ID = "4092afd7-9eb9-4d8d-aaf9-48868942dc08";
const REGRESSION_GOAL =
  "Write a draft email to myself at fakemail@gmail.com listing the linear issues that were completed yesterday.";

const EVAL_LIMITS = {
  max_iterations: 12,
  timeout_seconds: 120,
};

function evalTask(goal: string, overrides: Partial<Task> = {}): Task {
  return {
    goal,
    trigger: { type: "now" },
    assignee: "shaiden-newsletter-01",
    limits: EVAL_LIMITS,
    ...overrides,
  };
}

describe("task-loop termination live harness eval", { concurrency: 1 }, () => {
  it(
    "tool succeeds through real harness → goal_met",
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      const stack = await startEvalToriiStack({
        linearTools: [
          {
            name: "list_issues",
            handler: async () => ({
              text: JSON.stringify([
                { id: "NAT-1", title: "Shipped feature", completedAt: "yesterday" },
              ]),
            }),
          },
        ],
        gmailTools: [
          {
            name: "create_draft",
            handler: async () => ({ text: "draft created" }),
          },
        ],
      });

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(REGRESSION_GOAL),
          stack,
          approvalDriver: "approve",
        });

        assert.equal(
          result.outcome.status,
          "goal_met",
          `expected goal_met, got ${JSON.stringify(result.outcome)}`,
        );
      } finally {
        await stack.close();
      }
    },
  );

  it(
    `regression ${REGRESSION_TASK_ID} case 1: empty Linear list → goal_met (zero completed is valid)`,
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      const stack = await startEvalToriiStack({
        linearTools: [
          {
            name: "list_issues",
            handler: async () => ({ text: JSON.stringify([]) }),
          },
        ],
        gmailTools: [
          {
            name: "create_draft",
            handler: async () => ({ text: "draft created" }),
          },
        ],
      });

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(REGRESSION_GOAL),
          stack,
          approvalDriver: "approve",
        });

        assertOutcome(
          result.outcome,
          { status: "goal_met" },
          `${REGRESSION_TASK_ID}/empty_linear_list`,
        );
      } finally {
        await stack.close();
      }
    },
  );

  it(
    `regression ${REGRESSION_TASK_ID} case 2: Gmail permission error after approval → not goal_met`,
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      const stack = await startEvalToriiStack({
        linearTools: [
          {
            name: "list_issues",
            handler: async () => ({
              text: JSON.stringify([
                { id: "NAT-99", title: "shipped", completedAt: "yesterday" },
              ]),
            }),
          },
        ],
        gmailTools: [
          {
            name: "create_draft",
            handler: async () => ({
              text: "The caller does not have permission",
              isError: true,
            }),
          },
        ],
      });

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(REGRESSION_GOAL),
          stack,
          approvalDriver: "approve",
        });

        assertNotGoalMet(
          result.outcome,
          `${REGRESSION_TASK_ID}/gmail_permission_after_approval`,
        );
      } finally {
        await stack.close();
      }
    },
  );

  it(
    "tool errors, model retries through real harness → goal_met (NAT-106)",
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      let gmailCalls = 0;
      const stack = await startEvalToriiStack({
        gmailTools: [
          {
            name: "create_draft",
            handler: async (input: Record<string, unknown>) => {
              gmailCalls += 1;
              if (typeof input.to === "string") {
                return { text: "unknown recipient", isError: true };
              }
              return { text: "draft created" };
            },
          },
        ],
        linearTools: [],
      });

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(
            "Send a draft email to nathan.lafranceb@gmail.com summarizing yesterday's work. If create_draft returns unknown recipient, retry with to as a one-element array.",
          ),
          stack,
          approvalDriver: "approve",
        });

        assert.ok(
          gmailCalls >= 2,
          `expected at least two gmail.create_draft attempts after recovery, got ${gmailCalls}`,
        );
        assert.equal(
          result.outcome.status,
          "goal_met",
          `expected goal_met after recovery, got ${JSON.stringify(result.outcome)}`,
        );
      } finally {
        await stack.close();
      }
    },
  );

  it(
    "approval rejected at gated call → human_reject",
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      const stack = await startEvalToriiStack();

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(
            "Create a Gmail draft to myself with a short status update.",
          ),
          stack,
          approvalDriver: "reject",
          rejectReason: "too risky",
        });

        assertOutcome(result.outcome, { status: "human_reject" }, "approval_rejected");
      } finally {
        await stack.close();
      }
    },
  );
});
