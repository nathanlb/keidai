import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RunStopController } from "../run-stop-controller.js";

describe("RunStopController", () => {
  it("aborts an attached run when stop is requested", () => {
    const controller = new RunStopController();
    const signal = controller.attach("run-1");

    assert.equal(signal.aborted, false);
    controller.requestStop("run-1");
    assert.equal(signal.aborted, true);
    assert.equal(controller.isStopRequested("run-1"), true);
  });

  it("starts already aborted when stop was requested before attach", () => {
    const controller = new RunStopController();
    controller.requestStop("run-1");

    const signal = controller.attach("run-1");
    assert.equal(signal.aborted, true);
  });

  it("clears stop state on release so a later resume can be stopped again", () => {
    const controller = new RunStopController();
    controller.attach("run-1");
    controller.requestStop("run-1");
    controller.release("run-1");

    assert.equal(controller.isStopRequested("run-1"), false);
    const signal = controller.attach("run-1");
    assert.equal(signal.aborted, false);
  });
});
