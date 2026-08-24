import { describe, expect, it } from "vitest";
import type { RunStep } from "@keidai/shared";
import {
  formatToolCallDuration,
  formatToolResultBody,
  formatToolResultEyebrow,
  groupRunSteps,
} from "../group-run-steps.js";

const ts = (second: number) =>
  `2026-07-14T12:00:${String(second).padStart(2, "0")}.000Z`;

describe("groupRunSteps", () => {
  it("pairs tool_dispatch and tool_result by toolCallId into one entry", () => {
    const steps: RunStep[] = [
      {
        id: "m1",
        timestamp: ts(0),
        kind: "model",
        text: "Planning",
      },
      {
        id: "d1",
        timestamp: ts(1),
        kind: "tool_dispatch",
        toolName: "linear.list_projects",
        toolCallId: "call-1",
        inputPreview: '{"limit":50}',
      },
      {
        id: "r1",
        timestamp: ts(2),
        kind: "tool_result",
        toolName: "linear.list_projects",
        toolCallId: "call-1",
        status: "ok",
        outputPreview: '{"projects":[]}',
        charCount: 16,
        traceId: "trace-1",
      },
    ];

    const entries = groupRunSteps(steps, { runEnded: false });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: "step", step: { id: "m1" } });
    expect(entries[1]).toMatchObject({
      type: "tool_call",
      toolCallId: "call-1",
      status: "ok",
      durationMs: 1000,
      dispatch: { id: "d1" },
      result: { id: "r1" },
    });
  });

  it("keeps pending pairs open while the run is still active", () => {
    const steps: RunStep[] = [
      {
        id: "d1",
        timestamp: ts(1),
        kind: "tool_dispatch",
        toolName: "linear.list_initiatives",
        toolCallId: "call-1",
        inputPreview: '{"limit":50}',
      },
    ];

    const [entry] = groupRunSteps(steps, { runEnded: false });

    expect(entry).toMatchObject({
      type: "tool_call",
      status: "pending",
    });
    expect(entry?.type === "tool_call" ? entry.result : undefined).toBeUndefined();
  });

  it("resolves orphaned calls to error when the run has ended", () => {
    const steps: RunStep[] = [
      {
        id: "d1",
        timestamp: ts(1),
        kind: "tool_dispatch",
        toolName: "linear.list_initiatives",
        toolCallId: "call-1",
        inputPreview: '{"limit":50}',
      },
      {
        id: "o1",
        timestamp: ts(2),
        kind: "outcome",
        outcomeStatus: "failed",
        outcomeReason: "aborted",
      },
    ];

    const entries = groupRunSteps(steps, { runEnded: true });
    const orphan = entries[0];

    expect(orphan?.type).toBe("tool_call");
    if (orphan?.type !== "tool_call") {
      throw new Error("expected tool_call entry");
    }
    expect(orphan.status).toBe("error");
    expect(orphan.result).toBeUndefined();
    expect(formatToolResultEyebrow(orphan)).toBe("Error · no result");
    expect(formatToolResultBody(orphan)).toBe(
      "The run ended before this call returned.",
    );
  });

  it("renders orphaned tool_result steps as standalone rows", () => {
    const steps: RunStep[] = [
      {
        id: "r1",
        timestamp: ts(1),
        kind: "tool_result",
        toolName: "linear.list_projects",
        toolCallId: "missing-call",
        status: "ok",
        outputPreview: "{}",
      },
    ];

    const entries = groupRunSteps(steps, { runEnded: true });

    expect(entries).toEqual([
      {
        type: "step",
        step: steps[0],
      },
    ]);
  });

  it("pairs interleaved parallel tool calls by toolCallId", () => {
    const steps: RunStep[] = [
      {
        id: "d1",
        timestamp: ts(1),
        kind: "tool_dispatch",
        toolName: "a",
        toolCallId: "call-a",
      },
      {
        id: "d2",
        timestamp: ts(2),
        kind: "tool_dispatch",
        toolName: "b",
        toolCallId: "call-b",
      },
      {
        id: "r2",
        timestamp: ts(3),
        kind: "tool_result",
        toolName: "b",
        toolCallId: "call-b",
        status: "ok",
        charCount: 4,
      },
      {
        id: "r1",
        timestamp: ts(4),
        kind: "tool_result",
        toolName: "a",
        toolCallId: "call-a",
        status: "error",
        outputPreview: "boom",
      },
    ];

    const entries = groupRunSteps(steps, { runEnded: false });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      toolCallId: "call-a",
      status: "error",
      durationMs: 3000,
    });
    expect(entries[1]).toMatchObject({
      toolCallId: "call-b",
      status: "ok",
      durationMs: 1000,
    });
  });

  it("leaves tool_dispatch without toolCallId as a standalone step", () => {
    const steps: RunStep[] = [
      {
        id: "d1",
        timestamp: ts(1),
        kind: "tool_dispatch",
        toolName: "legacy.tool",
      },
    ];

    expect(groupRunSteps(steps, { runEnded: false })).toEqual([
      { type: "step", step: steps[0] },
    ]);
  });
});

describe("formatToolCallDuration", () => {
  it("formats compact durations", () => {
    expect(formatToolCallDuration(412)).toBe("412ms");
    expect(formatToolCallDuration(1200)).toBe("1.2s");
  });
});
