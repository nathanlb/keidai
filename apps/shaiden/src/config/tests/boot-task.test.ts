import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { taskSchema } from "@keidai/shared";
import { BOOT_TASK } from "../boot-task.js";

describe("boot task", () => {
  it("validates against the shared task schema", () => {
    const parsed = taskSchema.parse(BOOT_TASK);
    assert.equal(parsed.trigger.type, "now");
    assert.equal(parsed.assignee, "shaiden-newsletter-01");
    assert.ok(parsed.goal.length > 0);
  });
});
