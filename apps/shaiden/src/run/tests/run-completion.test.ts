import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outcomeStepFromTermination } from "../run-completion.js";

describe("outcomeStepFromTermination", () => {
  it("copies the failure class onto the outcome step", () => {
    assert.deepEqual(
      outcomeStepFromTermination({
        status: "failed",
        reason: "model call failed: not a valid model ID",
        failureClass: "platform",
      }),
      {
        id: "",
        timestamp: "",
        kind: "outcome",
        outcomeStatus: "failed",
        outcomeReason: "model call failed: not a valid model ID",
        failureClass: "platform",
      },
    );
  });

  it("omits the class when the outcome has none", () => {
    assert.deepEqual(outcomeStepFromTermination({ status: "goal_met" }), {
      id: "",
      timestamp: "",
      kind: "outcome",
      outcomeStatus: "goal_met",
    });
    assert.deepEqual(
      outcomeStepFromTermination({
        status: "failed",
        reason: "stored before classes existed",
      }),
      {
        id: "",
        timestamp: "",
        kind: "outcome",
        outcomeStatus: "failed",
        outcomeReason: "stored before classes existed",
      },
    );
  });
});
