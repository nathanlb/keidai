import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_TASK_LIMITS, type Task } from "@keidai/shared";
import { taskRevisionHash } from "../task-revision-hash.js";

const base = {
  goal: "Ship the newsletter",
  trigger: { type: "now" as const },
  assignee: "agent-1",
};

function hashOf(task: Task): string {
  return taskRevisionHash(task);
}

describe("taskRevisionHash", () => {
  it("hashes omitted limits as the defaults and null limits as null", () => {
    const omitted = hashOf(base);
    const explicitDefaults = hashOf({
      ...base,
      limits: { ...DEFAULT_TASK_LIMITS },
    });
    const noLimits = hashOf({
      ...base,
      limits: { max_iterations: null, timeout_seconds: null },
    });
    const iterationOff = hashOf({
      ...base,
      limits: { max_iterations: null, timeout_seconds: 60 },
    });

    assert.equal(omitted, explicitDefaults);
    assert.notEqual(omitted, noLimits);
    assert.notEqual(noLimits, iterationOff);
    assert.notEqual(omitted, iterationOff);
  });

  it("changes when the goal, a limit, or the model override changes", () => {
    const original = hashOf({
      ...base,
      limits: { max_iterations: 5, timeout_seconds: 60 },
      modelId: "openai/gpt-4.1-mini",
    });

    assert.notEqual(
      original,
      hashOf({
        ...base,
        goal: "Ship a different newsletter",
        limits: { max_iterations: 5, timeout_seconds: 60 },
        modelId: "openai/gpt-4.1-mini",
      }),
    );
    assert.notEqual(
      original,
      hashOf({
        ...base,
        limits: { max_iterations: 6, timeout_seconds: 60 },
        modelId: "openai/gpt-4.1-mini",
      }),
    );
    assert.notEqual(
      original,
      hashOf({
        ...base,
        limits: { max_iterations: 5, timeout_seconds: 61 },
        modelId: "openai/gpt-4.1-mini",
      }),
    );
    assert.notEqual(
      original,
      hashOf({
        ...base,
        limits: { max_iterations: 5, timeout_seconds: 60 },
        modelId: "openai/gpt-4.1",
      }),
    );
    assert.notEqual(
      original,
      hashOf({
        ...base,
        limits: { max_iterations: null, timeout_seconds: 60 },
        modelId: "openai/gpt-4.1-mini",
      }),
    );
  });
});
