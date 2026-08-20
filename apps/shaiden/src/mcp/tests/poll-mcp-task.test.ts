import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  nextTaskPollDelayMs,
  pollUntilTerminalMcpTask,
  createTaskPollWake,
  DEFAULT_TASK_POLL_INTERVAL_MS,
  MAX_TASK_POLL_INTERVAL_MS,
  MIN_TASK_POLL_INTERVAL_MS,
} from "../poll-mcp-task.js";
import { McpJsonRpcError } from "../post-mcp-jsonrpc.js";

const timestamps = {
  createdAt: "2026-08-13T12:00:00.000Z",
  lastUpdatedAt: "2026-08-13T12:00:00.000Z",
};

function workingTask(pollIntervalMs = 5_000) {
  return {
    resultType: "complete" as const,
    taskId: "task-1",
    status: "working" as const,
    ttlMs: 60_000,
    pollIntervalMs,
    ...timestamps,
  };
}

function completedTask() {
  return {
    resultType: "complete" as const,
    taskId: "task-1",
    status: "completed" as const,
    ttlMs: 60_000,
    pollIntervalMs: 5_000,
    result: {
      content: [{ type: "text", text: "ok" }],
      isError: false,
    },
    ...timestamps,
  };
}

describe("nextTaskPollDelayMs", () => {
  it("applies jitter inside 0.8–1.2 of the interval", () => {
    const low = nextTaskPollDelayMs(5_000, () => 0);
    const high = nextTaskPollDelayMs(5_000, () => 1);
    assert.equal(low, 4_000);
    assert.equal(high, 6_000);
  });

  it("floors a zero interval so polling cannot busy-loop", () => {
    assert.equal(nextTaskPollDelayMs(0, () => 0), MIN_TASK_POLL_INTERVAL_MS * 0.8);
  });

  it("caps an oversized interval", () => {
    assert.equal(
      nextTaskPollDelayMs(MAX_TASK_POLL_INTERVAL_MS * 4, () => 0),
      MAX_TASK_POLL_INTERVAL_MS * 0.8,
    );
  });

  it("defaults a missing interval", () => {
    assert.equal(
      nextTaskPollDelayMs(undefined, () => 0),
      DEFAULT_TASK_POLL_INTERVAL_MS * 0.8,
    );
  });
});

describe("pollUntilTerminalMcpTask", () => {
  it("returns immediately when the first poll is already terminal", async () => {
    const sleeps: number[] = [];
    const terminal = await pollUntilTerminalMcpTask({
      getTask: async () => completedTask(),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.equal(terminal.status, "completed");
    assert.deepEqual(sleeps, []);
  });

  it("honours pollIntervalMs between working polls", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const terminal = await pollUntilTerminalMcpTask({
      getTask: async () => {
        calls += 1;
        return calls === 1 ? workingTask(1_000) : completedTask();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    assert.equal(terminal.status, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [800]);
  });

  it("fails closed on input_required instead of spinning", async () => {
    await assert.rejects(
      () =>
        pollUntilTerminalMcpTask({
          getTask: async () => ({
            ...workingTask(),
            status: "input_required",
            inputRequests: { sample: {} },
          }),
        }),
      /does not support/,
    );
  });

  it("retries a transient getTask failure then completes", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const terminal = await pollUntilTerminalMcpTask({
      initialPollIntervalMs: 1_000,
      getTask: async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("fetch failed");
        }
        return completedTask();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    assert.equal(terminal.status, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [800]);
  });

  it("does not retry a JSON-RPC application error", async () => {
    await assert.rejects(
      () =>
        pollUntilTerminalMcpTask({
          getTask: async () => {
            throw new McpJsonRpcError(-32001, "task not found");
          },
        }),
      /task not found/,
    );
  });

  it("retries a JSON-RPC internal error then completes", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const terminal = await pollUntilTerminalMcpTask({
      initialPollIntervalMs: 1_000,
      getTask: async () => {
        calls += 1;
        if (calls === 1) {
          throw new McpJsonRpcError(-32603, "Internal server error");
        }
        return completedTask();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    assert.equal(terminal.status, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [800]);
  });

  it("retries an invalid tasks/get body then completes", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const terminal = await pollUntilTerminalMcpTask({
      initialPollIntervalMs: 1_000,
      getTask: async () => {
        calls += 1;
        if (calls === 1) {
          return { truncated: true };
        }
        return completedTask();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    });
    assert.equal(terminal.status, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, [800]);
  });

  it("skips the poll interval when a wake arrives", async () => {
    const wake = createTaskPollWake();
    const sleeps: number[] = [];
    let calls = 0;
    const terminal = await pollUntilTerminalMcpTask({
      getTask: async () => {
        calls += 1;
        if (calls === 1) {
          wake.signal();
          return workingTask(30_000);
        }
        return completedTask();
      },
      sleep: async (ms) => {
        sleeps.push(ms);
        await new Promise(() => {
          // Hang: the wake must win the race.
        });
      },
      wake,
      random: () => 0,
    });
    assert.equal(terminal.status, "completed");
    assert.equal(calls, 2);
    assert.deepEqual(sleeps, []);
  });
});
