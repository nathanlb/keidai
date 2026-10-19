import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApprovalRecordView } from "@keidai/shared";
import {
  approvalsVisibleToOperator,
  runsVisibleToOperator,
} from "../operator-scope.js";

const adaRun = {
  id: "run-ada",
  assignee: "ada-agent",
  agentOwnerId: "ada",
};
const legacyAdaRun = {
  id: "run-legacy",
  assignee: "ada-agent",
};
const bobRun = {
  id: "run-bob",
  assignee: "bob-agent",
  agentOwnerId: "bob",
};
const agents = [
  { id: "ada-agent", ownerId: "ada" },
  { id: "bob-agent", ownerId: "bob" },
];

describe("operator resource scope", () => {
  it("keeps a member's runs, including legacy rows resolved through the agent", () => {
    const visible = runsVisibleToOperator(
      [adaRun, legacyAdaRun, bobRun],
      agents,
      { ownerId: "ada", role: "member" },
    );
    assert.deepEqual(
      visible.map((run) => run.id),
      ["run-ada", "run-legacy"],
    );
  });

  it("returns every run to an admin", () => {
    const visible = runsVisibleToOperator([adaRun, bobRun], agents, {
      ownerId: "boss",
      role: "admin",
    });
    assert.equal(visible.length, 2);
  });

  it("filters approvals to the member's owner id", () => {
    const approvals = [
      { ownerId: "ada" },
      { ownerId: "bob" },
    ] as ApprovalRecordView[];
    const visible = approvalsVisibleToOperator(approvals, {
      ownerId: "ada",
      role: "member",
    });
    assert.deepEqual(
      visible.map((approval) => approval.ownerId),
      ["ada"],
    );
  });
});
