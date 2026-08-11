import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunListItem } from "@keidai/shared";
import { buildRunsVisibilityResponse } from "../build-runs-visibility-response.js";

function makeRun(overrides: Partial<RunListItem> = {}): RunListItem {
  return {
    id: "run-1",
    taskId: "task-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    assignee: "agent-1",
    goalPreview: "Summarize inbox",
    status: "running",
    stepCount: 2,
    ...overrides,
  };
}

describe("buildRunsVisibilityResponse", () => {
  it("joins runs to agents with displayName and initials", () => {
    const response = buildRunsVisibilityResponse(
      { runs: [makeRun()] },
      [
        {
          id: "agent-1",
          name: "Demo Agent",
          slug: "demo-agent",
        },
      ],
    );

    assert.equal(response.runs[0]?.assigneeDisplay?.displayName, "Demo Agent");
    assert.equal(response.runs[0]?.assigneeDisplay?.initials, "DA");
    assert.equal(response.agentsById["agent-1"]?.slug, "demo-agent");
  });

  it("falls back to slug when agent name is empty", () => {
    const response = buildRunsVisibilityResponse(
      { runs: [makeRun({ assignee: "agent-2" })] },
      [
        {
          id: "agent-2",
          name: "",
          slug: "newsletter-writer",
        },
      ],
    );

    assert.equal(
      response.runs[0]?.assigneeDisplay?.displayName,
      "newsletter-writer",
    );
    assert.equal(response.runs[0]?.assigneeDisplay?.initials, "NW");
  });

  it("returns null assigneeDisplay for unknown assignee ids", () => {
    const response = buildRunsVisibilityResponse(
      { runs: [makeRun({ assignee: "missing-agent" })] },
      [
        {
          id: "agent-1",
          name: "Demo Agent",
          slug: "demo-agent",
        },
      ],
    );

    assert.equal(response.runs[0]?.assigneeDisplay, null);
    assert.equal(Object.keys(response.agentsById).length, 1);
  });

  it("builds agentsById for all agents returned by Fuda", () => {
    const response = buildRunsVisibilityResponse(
      { runs: [] },
      [
        {
          id: "agent-1",
          name: "Alpha",
          slug: "alpha",
        },
        {
          id: "agent-2",
          name: "Beta",
          slug: "beta",
        },
      ],
    );

    assert.deepEqual(Object.keys(response.agentsById).sort(), [
      "agent-1",
      "agent-2",
    ]);
  });
});
