import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunStep, Task } from "@keidai/shared";
import {
  approximateActiveMs,
  buildAttemptFact,
  type AttemptRunSource,
} from "../attempt-fact.js";
import {
  DEFAULT_ATTEMPT_RETENTION_DAYS,
  attemptRetentionMs,
} from "../attempt-retention.js";

const task: Task = {
  goal: "Ship the newsletter",
  trigger: { type: "now" },
  assignee: "agent-1",
  limits: { max_iterations: 5, timeout_seconds: 60 },
};

const run: AttemptRunSource = {
  id: "run-1",
  taskId: "task-1",
  task,
  assignee: "agent-1",
  startedAt: "2026-07-08T12:00:00.000Z",
  modelId: "openai/gpt-4.1-mini",
  personaVersion: 3,
  agentOwnerId: "owner-1",
};

function step(
  id: string,
  timestamp: string,
  fields: { kind: RunStep["kind"] } & Record<string, unknown>,
): RunStep {
  return { id, timestamp, ...fields } as RunStep;
}

describe("buildAttemptFact", () => {
  it("counts tools, approvals, and a rejection on the outcome", () => {
    const steps: RunStep[] = [
      step("model-1", "2026-07-08T12:00:01.000Z", {
        kind: "model",
        text: "looking",
      }),
      step("dispatch-1", "2026-07-08T12:00:02.000Z", {
        kind: "tool_dispatch",
        toolName: "notion.search",
      }),
      step("result-1", "2026-07-08T12:00:03.000Z", {
        kind: "tool_result",
        toolName: "notion.search",
        status: "error",
      }),
      step("wait-1", "2026-07-08T12:00:04.000Z", {
        kind: "waiting_approval",
        toolName: "notion.search",
      }),
      step("outcome-1", "2026-07-08T12:00:10.000Z", {
        kind: "outcome",
        outcomeStatus: "human_reject",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-1",
      previousAttempts: [],
      liveBudget: { iterationsUsed: 2, activeElapsedMs: 1_500 },
    });

    assert.equal(fact.kind, "initial");
    assert.equal(fact.attemptIndex, 1);
    assert.equal(fact.iterationsUsed, 2);
    assert.equal(fact.activeMs, 1_500);
    assert.equal(fact.backfilled, false);
    assert.equal(fact.approvalRequestCount, 1);
    assert.equal(fact.rejectionCount, 1);
    assert.equal(fact.failureClass, null);
    assert.deepEqual(fact.toolCounts, {
      "notion.search": { calls: 1, errors: 1 },
    });
    assert.equal(fact.startedAt, run.startedAt);
    assert.equal(fact.endedAt, "2026-07-08T12:00:10.000Z");
  });

  it("keeps a follow-up's reset budget instead of subtracting the previous attempt", () => {
    const steps: RunStep[] = [
      step("outcome-1", "2026-07-08T12:00:10.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
      step("message-1", "2026-07-08T12:01:00.000Z", {
        kind: "user_message",
        text: "try again",
      }),
      step("model-2", "2026-07-08T12:01:01.000Z", { kind: "model" }),
      step("outcome-2", "2026-07-08T12:01:20.000Z", {
        kind: "outcome",
        outcomeStatus: "failed",
        outcomeReason: "still missing",
        failureClass: "agent",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-2",
      previousAttempts: [
        {
          attemptIndex: 1,
          kind: "initial",
          iterationsUsed: 3,
          activeMs: 1_500,
        },
      ],
      liveBudget: { iterationsUsed: 4, activeElapsedMs: 800 },
    });

    assert.equal(fact.kind, "follow_up");
    assert.equal(fact.attemptIndex, 2);
    assert.equal(fact.iterationsUsed, 4);
    assert.equal(fact.activeMs, 800);
    assert.equal(fact.startedAt, "2026-07-08T12:01:00.000Z");
    assert.equal(fact.outcomeReason, "still missing");
    assert.equal(fact.failureClass, "agent");
    assert.equal(fact.rejectionCount, 0);
  });

  it("treats an unrecognized failure class as unknown", () => {
    const fact = buildAttemptFact({
      run,
      steps: [
        step("outcome-1", "2026-07-08T12:00:10.000Z", {
          kind: "outcome",
          outcomeStatus: "failed",
          outcomeReason: "old row",
          failureClass: "configuration",
        }),
      ],
      outcomeStepId: "outcome-1",
      previousAttempts: [],
      liveBudget: { iterationsUsed: 1, activeElapsedMs: 10 },
    });

    assert.equal(fact.failureClass, null);
  });

  it("stores the delta when a resume leaves the run counters cumulative", () => {
    const steps: RunStep[] = [
      step("outcome-1", "2026-07-08T12:00:10.000Z", {
        kind: "outcome",
        outcomeStatus: "stopped",
      }),
      step("model-2", "2026-07-08T12:05:00.000Z", { kind: "model" }),
      step("outcome-2", "2026-07-08T12:05:05.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-2",
      previousAttempts: [
        {
          attemptIndex: 1,
          kind: "initial",
          iterationsUsed: 2,
          activeMs: 1_000,
        },
      ],
      liveBudget: { iterationsUsed: 5, activeElapsedMs: 2_500 },
    });

    assert.equal(fact.kind, "initial");
    assert.equal(fact.iterationsUsed, 3);
    assert.equal(fact.activeMs, 1_500);
    assert.equal(fact.startedAt, "2026-07-08T12:05:00.000Z");
  });

  it("subtracts only attempts since the last follow-up when resuming", () => {
    const steps: RunStep[] = [
      step("outcome-1", "2026-07-08T12:00:10.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
      step("message-1", "2026-07-08T12:01:00.000Z", {
        kind: "user_message",
        text: "try again",
      }),
      step("outcome-2", "2026-07-08T12:01:20.000Z", {
        kind: "outcome",
        outcomeStatus: "stopped",
      }),
      step("model-3", "2026-07-08T12:05:00.000Z", { kind: "model" }),
      step("outcome-3", "2026-07-08T12:05:05.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-3",
      previousAttempts: [
        {
          attemptIndex: 1,
          kind: "initial",
          iterationsUsed: 5,
          activeMs: 4_000,
        },
        {
          attemptIndex: 2,
          kind: "follow_up",
          iterationsUsed: 3,
          activeMs: 900,
        },
      ],
      liveBudget: { iterationsUsed: 5, activeElapsedMs: 1_400 },
    });

    assert.equal(fact.kind, "initial");
    assert.equal(fact.attemptIndex, 3);
    assert.equal(fact.iterationsUsed, 2);
    assert.equal(fact.activeMs, 500);
  });

  it("keeps a message queued while parked inside the current attempt", () => {
    const steps: RunStep[] = [
      step("model-1", "2026-07-08T12:00:01.000Z", { kind: "model" }),
      step("wait-1", "2026-07-08T12:00:02.000Z", {
        kind: "waiting_approval",
      }),
      step("message-1", "2026-07-08T12:00:30.000Z", {
        kind: "user_message",
        text: "also cc the team",
      }),
      step("model-2", "2026-07-08T12:01:00.000Z", { kind: "model" }),
      step("outcome-1", "2026-07-08T12:01:05.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-1",
      previousAttempts: [],
      liveBudget: { iterationsUsed: 2, activeElapsedMs: 3_000 },
    });

    assert.equal(fact.kind, "initial");
    assert.equal(fact.attemptIndex, 1);
    assert.equal(fact.startedAt, run.startedAt);
  });

  it("indexes past outcomes that predate the attempt table", () => {
    const steps: RunStep[] = [
      step("outcome-1", "2026-07-08T12:00:10.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
      step("message-1", "2026-07-08T12:01:00.000Z", {
        kind: "user_message",
        text: "try again",
      }),
      step("outcome-2", "2026-07-08T12:01:20.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-2",
      previousAttempts: [],
      liveBudget: { iterationsUsed: 1, activeElapsedMs: 200 },
    });

    assert.equal(fact.attemptIndex, 2);
    assert.equal(fact.kind, "follow_up");
  });

  it("derives iterations and active time from steps when backfilling", () => {
    const steps: RunStep[] = [
      step("model-1", "2026-07-08T12:00:01.000Z", { kind: "model" }),
      step("wait-1", "2026-07-08T12:00:02.000Z", {
        kind: "waiting_approval",
      }),
      step("model-2", "2026-07-08T12:00:05.000Z", { kind: "model" }),
      step("outcome-1", "2026-07-08T12:00:06.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    assert.equal(
      approximateActiveMs(
        steps,
        "2026-07-08T12:00:00.000Z",
        "2026-07-08T12:00:06.000Z",
      ),
      3_000,
    );

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-1",
      previousAttempts: [],
    });
    assert.equal(fact.backfilled, true);
    assert.equal(fact.iterationsUsed, 2);
    assert.equal(fact.activeMs, 3_000);
    assert.equal(fact.inputTokens, null);
    assert.equal(fact.cost, null);
    assert.equal(fact.resolvedModelId, null);
  });

  it("sums model-step tokens and keeps the last resolved model", () => {
    const steps: RunStep[] = [
      step("model-1", "2026-07-08T12:00:01.000Z", {
        kind: "model",
        inputTokens: 100,
        outputTokens: 20,
        cost: 0.125,
        resolvedModelId: "deepseek/deepseek-v4-flash",
      }),
      step("model-2", "2026-07-08T12:00:04.000Z", {
        kind: "model",
        inputTokens: 40,
        outputTokens: 10,
        cost: 0.125,
        resolvedModelId: "google/gemini-2.5-flash",
      }),
      step("outcome-1", "2026-07-08T12:00:10.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    const fact = buildAttemptFact({
      run: { ...run, modelId: "~deepseek/deepseek-v4-flash-latest" },
      steps,
      outcomeStepId: "outcome-1",
      previousAttempts: [],
      liveBudget: { iterationsUsed: 2, activeElapsedMs: 100 },
    });

    assert.equal(fact.modelId, "~deepseek/deepseek-v4-flash-latest");
    assert.equal(fact.inputTokens, 140);
    assert.equal(fact.outputTokens, 30);
    assert.equal(fact.cost, 0.25);
    assert.equal(fact.resolvedModelId, "google/gemini-2.5-flash");
    assert.equal(fact.resolvedModelChanged, true);
  });

  it("counts Torii denials and linking-required results, ignoring harness-local tools", () => {
    const steps: RunStep[] = [
      step("tool-1", "2026-07-08T12:00:01.000Z", {
        kind: "tool_result",
        toolName: "gmail.create_draft",
        decision: "denied",
      }),
      step("tool-2", "2026-07-08T12:00:02.000Z", {
        kind: "tool_result",
        toolName: "gmail.list_drafts",
        decision: "linking-required",
      }),
      step("tool-3", "2026-07-08T12:00:03.000Z", {
        kind: "tool_result",
        toolName: "execute_python",
        status: "ok",
      }),
      step("tool-4", "2026-07-08T12:00:04.000Z", {
        kind: "tool_result",
        toolName: "gmail.send",
        decision: "allowed",
        durationMs: 40,
      }),
      step("outcome-1", "2026-07-08T12:00:05.000Z", {
        kind: "outcome",
        outcomeStatus: "goal_met",
      }),
    ];

    const fact = buildAttemptFact({
      run,
      steps,
      outcomeStepId: "outcome-1",
      previousAttempts: [],
    });

    assert.equal(fact.denialCount, 1);
    assert.equal(fact.linkingRequiredCount, 1);
  });
});

describe("attemptRetentionMs", () => {
  it("defaults to 365 days and rejects a non-positive override", () => {
    assert.equal(
      attemptRetentionMs({}),
      DEFAULT_ATTEMPT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    assert.equal(
      attemptRetentionMs({ SHAIDEN_ATTEMPT_RETENTION_DAYS: "14" }),
      14 * 24 * 60 * 60 * 1000,
    );
    assert.throws(
      () => attemptRetentionMs({ SHAIDEN_ATTEMPT_RETENTION_DAYS: "0" }),
      /SHAIDEN_ATTEMPT_RETENTION_DAYS/,
    );
  });
});
