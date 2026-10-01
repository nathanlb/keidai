import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Logger, Task } from "@keidai/shared";
import {
  MCP_INPUT_REQUIRED_FAILURE_REASON,
  parkedTaskPollFromError,
  parkedTaskPollFromGet,
  type ParkedTaskPoll,
} from "../../mcp/poll-mcp-task.js";
import { McpJsonRpcError } from "../../mcp/post-mcp-jsonrpc.js";
import { createTestPersistence, createTestRun } from "../../testing/persistence.js";
import { resumeParkedHarnessRuns } from "../resume-parked-runs.js";
import { RunNotClaimedError } from "../run-lease.js";

const sampleTask: Task = {
  goal: "Draft a note.",
  trigger: { type: "now" },
  assignee: "shaiden-newsletter-01",
};

function silentLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

const parkedAt = Date.parse("2026-07-08T12:00:00.000Z");

function terminalPoll(): () => Promise<ParkedTaskPoll> {
  return async () => ({ kind: "terminal" });
}

describe("resumeParkedHarnessRuns", () => {
  it("resumes running runs that have a persisted MCP task id", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
        {
          role: "assistant",
          text: "",
          toolCalls: [
            {
              toolCallId: "call-1",
              toolName: "gmail.create_draft",
              input: {},
            },
          ],
        },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "a".repeat(64),
        pollIntervalMs: 1_000,
      });

      const resumed: string[] = [];
      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        replicaId: "replica-b",
        pollParkedTask: terminalPoll(),
        resumeHarnessRun: (input) => {
          resumed.push(input.runId);
          assert.equal(input.task.goal, sampleTask.goal);
          assert.equal(input.initialHistory[0]?.role, "user");
          return { done: Promise.resolve() };
        },
        logger: silentLogger(),
      });

      assert.equal(count, 1);
      assert.deepEqual(resumed, ["run-1"]);
    } finally {
      await persistence.close();
    }
  });

  it("skips a parked run that has no conversation history", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });

      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        replicaId: "replica-b",
        pollParkedTask: terminalPoll(),
        resumeHarnessRun: () => {
          throw new Error("should not resume");
        },
        logger: silentLogger(),
      });

      assert.equal(count, 0);
    } finally {
      await persistence.close();
    }
  });

  it("skips a parked run whose lease is still held by another replica", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });
      assert.equal(
        await persistence.runStore.claimRun(
          "run-1",
          "replica-a",
          "2026-07-08T12:00:15.000Z",
          "2026-07-08T12:00:00.000Z",
        ),
        true,
      );

      let polls = 0;
      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        replicaId: "replica-b",
        now: () => Date.parse("2026-07-08T12:00:00.000Z"),
        pollParkedTask: async () => {
          polls += 1;
          return { kind: "terminal" };
        },
        resumeHarnessRun: () => {
          throw new Error("should not resume");
        },
        logger: silentLogger(),
      });

      assert.equal(polls, 0);

      assert.equal(count, 0);
    } finally {
      await persistence.close();
    }
  });

  it("schedules the next poll while the task is still working and does not resume", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
        pollIntervalMs: 1_000,
      });

      let polls = 0;
      const sweep = (nowMs: number) =>
        resumeParkedHarnessRuns({
          runStore: persistence.runStore,
          replicaId: "replica-b",
          now: () => nowMs,
          nextPollDelayMs: () => 5_000,
          pollParkedTask: async () => {
            polls += 1;
            return parkedTaskPollFromGet({
              resultType: "complete",
              taskId: "parked-1",
              status: "working",
              ttlMs: 60_000,
              pollIntervalMs: 1_000,
              createdAt: "2026-07-08T12:00:00.000Z",
              lastUpdatedAt: "2026-07-08T12:00:00.000Z",
            });
          },
          resumeHarnessRun: () => {
            throw new Error("should not resume");
          },
          logger: silentLogger(),
        });

      assert.equal(await sweep(parkedAt), 0);
      assert.equal(polls, 1);
      const due = await persistence.runStore.getParkedMcpTask("run-1");
      assert.equal(due?.nextPollAt, new Date(parkedAt + 5_000).toISOString());
      assert.equal((await persistence.runStore.getRun("run-1"))?.status, "running");

      assert.equal(await sweep(parkedAt + 1_000), 0);
      assert.equal(polls, 1);
      assert.deepEqual(await persistence.runStore.getConversationHistory("run-1"), [
        { role: "user", text: "goal" },
      ]);
    } finally {
      await persistence.close();
    }
  });

  it("resumes when a sweep sees a terminal task and the lease is free", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });
      await persistence.runStore.setNextPollAt(
        "run-1",
        new Date(parkedAt).toISOString(),
      );

      const resumed: string[] = [];
      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        replicaId: "replica-b",
        now: () => parkedAt,
        pollParkedTask: async () =>
          parkedTaskPollFromGet({
            resultType: "complete",
            taskId: "parked-1",
            status: "completed",
            ttlMs: 60_000,
            pollIntervalMs: 1_000,
            createdAt: "2026-07-08T12:00:00.000Z",
            lastUpdatedAt: "2026-07-08T12:00:00.000Z",
            result: {
              content: [{ type: "text", text: "ok" }],
              isError: false,
            },
          }),
        resumeHarnessRun: (input) => {
          resumed.push(input.runId);
          return { done: Promise.resolve() };
        },
        logger: silentLogger(),
      });

      assert.equal(count, 1);
      assert.deepEqual(resumed, ["run-1"]);
    } finally {
      await persistence.close();
    }
  });

  it("fails the run on input_required or a fatal tasks/get error without resuming", async () => {
    const persistence = await createTestPersistence();
    try {
      for (const [runId, poll] of [
        [
          "run-input",
          parkedTaskPollFromGet({
            resultType: "complete",
            taskId: "parked-1",
            status: "input_required",
            ttlMs: 60_000,
            createdAt: "2026-07-08T12:00:00.000Z",
            lastUpdatedAt: "2026-07-08T12:00:00.000Z",
            inputRequests: {},
          }),
        ],
        [
          "run-fatal",
          parkedTaskPollFromError(
            new McpJsonRpcError(-32602, "Invalid params"),
          ),
        ],
      ] as const) {
        await createTestRun(persistence, { runId, task: sampleTask });
        await persistence.runStore.setParkedMcpTask(runId, {
          mcpTaskId: "parked-1",
        });
        const count = await resumeParkedHarnessRuns({
          runStore: persistence.runStore,
          replicaId: "replica-b",
          now: () => parkedAt,
          pollParkedTask: async (parked) =>
            parked.runId === runId ? poll : { kind: "pending" },
          resumeHarnessRun: () => {
            throw new Error("should not resume");
          },
          logger: silentLogger(),
        });
        assert.equal(count, 0);
        const run = await persistence.runStore.getRun(runId);
        assert.equal(run?.status, "completed");
        assert.equal(run?.outcome?.status, "failed");
        if (runId === "run-input") {
          assert.equal(run?.outcome?.reason, MCP_INPUT_REQUIRED_FAILURE_REASON);
        } else {
          assert.equal(run?.outcome?.reason, "Invalid params");
        }
      }
    } finally {
      await persistence.close();
    }
  });

  it("leaves a retryable poll error running and schedules another poll", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
        pollIntervalMs: 1_000,
      });

      const count = await resumeParkedHarnessRuns({
        runStore: persistence.runStore,
        replicaId: "replica-b",
        now: () => parkedAt,
        nextPollDelayMs: () => 5_000,
        pollParkedTask: async () =>
          parkedTaskPollFromError(new Error("socket hang up"), 1_000),
        resumeHarnessRun: () => {
          throw new Error("should not resume");
        },
        logger: silentLogger(),
      });

      assert.equal(count, 0);
      assert.equal((await persistence.runStore.getRun("run-1"))?.status, "running");
      assert.equal(
        (await persistence.runStore.getParkedMcpTask("run-1"))?.nextPollAt,
        new Date(parkedAt + 5_000).toISOString(),
      );
    } finally {
      await persistence.close();
    }
  });

  it("survives a second sweep losing the claim after both see a terminal task", async () => {
    const persistence = await createTestPersistence();
    try {
      await createTestRun(persistence, { runId: "run-1", task: sampleTask });
      await persistence.runStore.setConversationHistory("run-1", [
        { role: "user", text: "goal" },
      ]);
      await persistence.runStore.setParkedMcpTask("run-1", {
        mcpTaskId: "parked-1",
      });

      let polls = 0;
      let releasePolls!: () => void;
      const bothPolled = new Promise<void>((resolve) => {
        releasePolls = resolve;
      });
      let claims = 0;
      const sweep = () =>
        resumeParkedHarnessRuns({
          runStore: persistence.runStore,
          replicaId: "replica-b",
          now: () => parkedAt,
          pollParkedTask: async () => {
            polls += 1;
            if (polls === 2) {
              releasePolls();
            }
            await bothPolled;
            return { kind: "terminal" as const };
          },
          resumeHarnessRun: async (input) => {
            const owner = `replica-${claims}`;
            claims += 1;
            const claimed = await input.runStore.claimRun(
              input.runId,
              owner,
              "2026-07-08T12:00:15.000Z",
              "2026-07-08T12:00:00.000Z",
            );
            if (!claimed) {
              return {
                done: new Promise((_, reject) => {
                  setTimeout(
                    () => reject(new RunNotClaimedError(input.runId)),
                    0,
                  );
                }),
              };
            }
            return { done: Promise.resolve() };
          },
          logger: silentLogger(),
        });

      const counts = await Promise.all([sweep(), sweep()]);
      assert.equal(polls, 2);
      assert.equal(claims, 2);
      assert.deepEqual(counts.sort(), [1, 1]);
    } finally {
      await persistence.close();
    }
  });
});
