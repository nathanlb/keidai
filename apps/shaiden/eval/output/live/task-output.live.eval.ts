/**
 * Live harness evals: agent chooses report_task_output appropriately.
 *
 * Requires OPEN_ROUTER_API_KEY. Boots an in-process Torii gateway with mock MCP
 * backends so tool payloads are deterministic while the harness path is production-faithful.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Task } from "@keidai/shared";
import {
  assertHasOutputStep,
  assertNoOutputStep,
} from "../../helpers/assert-output.js";
import { assertOutcome } from "../../helpers/assert-outcome.js";
import { runLiveHarnessEval } from "../../helpers/live-harness.js";
import { startEvalToriiStack } from "../../helpers/torii-eval-stack.js";

const LIVE_EVAL_TIMEOUT_MS = 180_000;

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

describe("task-output live harness eval", { concurrency: 1 }, () => {
  it(
    "in-band text answer → goal_met with an Output step",
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      const stack = await startEvalToriiStack({
        linearTools: [],
        includeGmail: false,
      });

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(
            "Answer in the run log for the operator: what is 17 + 25? Put the numeric answer in an in-band deliverable. Do not create emails, tickets, or other external artifacts.",
          ),
          stack,
        });

        assertOutcome(result.outcome, { status: "goal_met" }, "in_band_arithmetic");
        assertHasOutputStep(result.steps, "in_band_arithmetic", /\b42\b/);
      } finally {
        await stack.close();
      }
    },
  );

  it(
    "tool research then in-band summary → goal_met with an Output step",
    { timeout: LIVE_EVAL_TIMEOUT_MS },
    async () => {
      const stack = await startEvalToriiStack({
        linearTools: [
          {
            name: "list_issues",
            handler: async () => ({
              text: JSON.stringify([
                { id: "NAT-1", title: "Ship output steps", completedAt: "yesterday" },
                { id: "NAT-2", title: "Harden assessment", completedAt: "yesterday" },
              ]),
            }),
          },
        ],
        includeGmail: false,
      });

      try {
        const result = await runLiveHarnessEval({
          task: evalTask(
            "Look up Linear issues completed yesterday, then write a short bullet summary in the run log for the operator. Do not send email or create drafts — the run-log summary is the deliverable.",
          ),
          stack,
        });

        assertOutcome(
          result.outcome,
          { status: "goal_met" },
          "research_then_in_band_summary",
        );
        assertHasOutputStep(result.steps, "research_then_in_band_summary");
        assert.ok(
          result.steps.some(
            (step) =>
              step.kind === "tool_result" && step.toolName === "linear.list_issues",
          ),
          "expected linear.list_issues to be called before the in-band summary",
        );
      } finally {
        await stack.close();
      }
    },
  );

  it(
    "external-only deliverable → goal_met without an Output step",
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
          task: evalTask(
            "Write a draft email to myself at fakemail@gmail.com listing the linear issues that were completed yesterday. The Gmail draft is the only deliverable — do not also write an in-band run-log output.",
          ),
          stack,
          approvalDriver: "approve",
        });

        assertOutcome(
          result.outcome,
          { status: "goal_met" },
          "external_only_draft",
        );
        assert.ok(
          result.steps.some(
            (step) =>
              step.kind === "tool_result" &&
              step.toolName === "gmail.create_draft" &&
              step.status === "ok",
          ),
          "expected a successful gmail.create_draft tool result",
        );
        assertNoOutputStep(result.steps, "external_only_draft");
      } finally {
        await stack.close();
      }
    },
  );
});
