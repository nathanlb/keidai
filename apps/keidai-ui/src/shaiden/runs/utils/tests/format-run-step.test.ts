import { describe, expect, it } from "vitest";
import type { RunStep } from "@keidai/shared";
import {
  formatRunStepDescription,
  formatRunStepTitle,
} from "../format-run-step.js";

describe("formatRunStepTitle", () => {
  it("labels tool steps distinctly from reasoning", () => {
    const modelStep: RunStep = {
      id: "1",
      timestamp: "2026-07-14T12:00:00.000Z",
      kind: "model",
      text: "Planning next action",
    };
    const dispatchStep: RunStep = {
      id: "2",
      timestamp: "2026-07-14T12:00:01.000Z",
      kind: "tool_dispatch",
      toolName: "notion_search",
      inputPreview: '{"query":"jobs"}',
    };

    expect(formatRunStepTitle(modelStep)).toBe("Reasoning");
    expect(formatRunStepTitle(dispatchStep)).toBe("Tool call · notion_search");
  });

  it("labels tool result and approval steps", () => {
    const resultStep: RunStep = {
      id: "3",
      timestamp: "2026-07-14T12:00:02.000Z",
      kind: "tool_result",
      toolName: "notion_search",
      status: "ok",
    };
    const approvalStep: RunStep = {
      id: "4",
      timestamp: "2026-07-14T12:00:03.000Z",
      kind: "waiting_approval",
      toolName: "gmail.create_draft",
      approvalId: "approval-1",
    };

    expect(formatRunStepTitle(resultStep)).toBe("Tool result · notion_search");
    expect(formatRunStepTitle(approvalStep)).toBe(
      "Awaiting approval · gmail.create_draft",
    );
  });
});

describe("formatRunStepDescription", () => {
  it("shows tool arguments and error output", () => {
    const dispatchStep: RunStep = {
      id: "1",
      timestamp: "2026-07-14T12:00:00.000Z",
      kind: "tool_dispatch",
      toolName: "notion_search",
      inputPreview: '{"query":"jobs"}',
    };
    const errorStep: RunStep = {
      id: "2",
      timestamp: "2026-07-14T12:00:01.000Z",
      kind: "tool_result",
      toolName: "notion_search",
      status: "error",
      outputPreview: "policy denied",
    };

    expect(formatRunStepDescription(dispatchStep)).toBe(
      'Arguments: {"query":"jobs"}',
    );
    expect(formatRunStepDescription(errorStep)).toBe("policy denied");
  });

  it("shows successful tool output and approval arguments", () => {
    const okStep: RunStep = {
      id: "3",
      timestamp: "2026-07-14T12:00:02.000Z",
      kind: "tool_result",
      toolName: "notion_search",
      status: "ok",
      outputPreview: "3 matching pages",
      charCount: 18,
    };
    const approvalStep: RunStep = {
      id: "4",
      timestamp: "2026-07-14T12:00:03.000Z",
      kind: "waiting_approval",
      toolName: "gmail.create_draft",
      inputPreview: '{"to":"team@example.com"}',
    };

    expect(formatRunStepDescription(okStep)).toBe("3 matching pages");
    expect(formatRunStepDescription(approvalStep)).toBe(
      'Arguments: {"to":"team@example.com"}',
    );
  });

  it("falls back when previews are missing", () => {
    const okStep: RunStep = {
      id: "5",
      timestamp: "2026-07-14T12:00:04.000Z",
      kind: "tool_result",
      toolName: "notion_search",
      status: "ok",
      charCount: 1200,
    };
    const approvalStep: RunStep = {
      id: "6",
      timestamp: "2026-07-14T12:00:05.000Z",
      kind: "waiting_approval",
      toolName: "gmail.create_draft",
    };

    expect(formatRunStepDescription(okStep)).toBe("Returned 1,200 chars");
    expect(formatRunStepDescription(approvalStep)).toBe(
      "Parked on a gated tool call",
    );
  });
});
