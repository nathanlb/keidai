import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ActiveRunRegistry,
  createActiveRunHandle,
} from "../active-run-registry.js";

describe("ActiveRunRegistry", () => {
  it("queues follow-up messages only while waiting for approval", () => {
    const registry = new ActiveRunRegistry();
    const handle = createActiveRunHandle("run-1");
    registry.register(handle);

    assert.equal(handle.queueUserMessageIfWaiting("too early"), false);

    handle.setWaitingForApproval(true);
    assert.equal(handle.queueUserMessageIfWaiting("while parked"), true);
    assert.equal(handle.queueUserMessageIfWaiting("second message"), true);

    handle.setWaitingForApproval(false);
    assert.equal(handle.queueUserMessageIfWaiting("after resume"), false);
  });

  it("drains queued messages in FIFO order", () => {
    const handle = createActiveRunHandle("run-1");
    handle.setWaitingForApproval(true);
    handle.queueUserMessageIfWaiting("first");
    handle.queueUserMessageIfWaiting("second");

    const drained = handle.drainPendingUserMessages();
    assert.deepEqual(drained, [
      { role: "user", text: "first" },
      { role: "user", text: "second" },
    ]);
    assert.deepEqual(handle.drainPendingUserMessages(), []);
  });

  it("unregister only removes the handle that registered", () => {
    const registry = new ActiveRunRegistry();
    const first = createActiveRunHandle("run-1");
    const second = createActiveRunHandle("run-1");
    const unregisterFirst = registry.register(first);
    const unregisterSecond = registry.register(second);

    unregisterFirst();
    assert.equal(registry.get("run-1"), second);

    unregisterSecond();
    assert.equal(registry.get("run-1"), undefined);
  });
});
