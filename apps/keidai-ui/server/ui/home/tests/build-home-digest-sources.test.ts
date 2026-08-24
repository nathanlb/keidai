import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ApprovalRecordView } from "@keidai/shared";
import {
  buildHomeDigestSourcesResponse,
  collectRunningRunIds,
} from "../build-home-digest-sources.js";

function approval(
  overrides: Partial<ApprovalRecordView> = {},
): ApprovalRecordView {
  return {
    id: "appr-1",
    agentId: "agt-1",
    ownerId: "owner-a",
    toolName: "gmail.send_email",
    params: {},
    runId: "run-parked",
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("collectRunningRunIds", () => {
  it("excludes runs parked on pending approvals", () => {
    const ids = collectRunningRunIds(
      [approval({ runId: "run-parked" })],
      [
        {
          id: "run-parked",
          taskId: "task-1",
          startedAt: "2026-01-01T00:00:00.000Z",
          assignee: "agt-1",
          goalPreview: "parked",
          status: "running",
          stepCount: 1,
          assigneeDisplay: null,
        },
        {
          id: "run-live",
          taskId: "task-2",
          startedAt: "2026-01-01T00:00:00.000Z",
          assignee: "agt-1",
          goalPreview: "live",
          status: "running",
          stepCount: 2,
          assigneeDisplay: null,
        },
      ],
    );

    assert.deepEqual(ids, ["run-live"]);
  });

  it("ignores non-running runs", () => {
    const ids = collectRunningRunIds([], [
      {
        id: "run-done",
        taskId: "task-1",
        startedAt: "2026-01-01T00:00:00.000Z",
        assignee: "agt-1",
        goalPreview: "done",
        status: "completed",
        stepCount: 1,
        assigneeDisplay: null,
      },
    ]);

    assert.deepEqual(ids, []);
  });
});

describe("buildHomeDigestSourcesResponse", () => {
  it("returns a shallow copy of the assembled payload", () => {
    const response = buildHomeDigestSourcesResponse({
      approvals: [approval()],
      runs: [],
      runReports: { "run-live": { id: "run-live" } as never },
      tasks: [],
      agents: [],
      groups: [],
    });

    assert.equal(response.approvals.length, 1);
    assert.equal(response.runReports["run-live"]?.id, "run-live");
  });
});
