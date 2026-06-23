import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DigestResult } from "../assertions.js";
import {
  assertDigestGmailDraftCreated,
  assertDigestAndDraftPhase,
  assertDigestToolCalls,
  assertPolicyDeniedVisible,
  collectToolCallNames,
} from "../assertions.js";

function fakeResult(
  toolNames: string[],
  text: string,
  toolErrors: string[] = [],
): DigestResult {
  return {
    text,
    steps: [
      {
        toolCalls: toolNames.map((toolName) => ({ toolName })),
        toolResults: toolErrors.map((error) => ({
          type: "tool-error",
          error: new Error(error),
        })),
      },
    ],
  };
}

describe("demo scenario assertions", () => {
  it("accepts expected digest and draft tool calls", () => {
    const toolNames = [
      "linear.list_issues",
      "github.search_issues",
      "notion.notion-search",
      "gmail.create_draft",
    ];

    assertDigestAndDraftPhase(fakeResult(toolNames, ""));
  });

  it("accepts expected digest tool calls", () => {
    const sourceToolNames = [
      "linear.list_issues",
      "github.search_issues",
      "notion.notion-search",
    ];

    assertDigestToolCalls(sourceToolNames);
    assert.deepEqual(
      collectToolCallNames(fakeResult(sourceToolNames, "")),
      sourceToolNames,
    );
  });

  it("accepts model-reported underscore tool names and discovery meta tools", () => {
    assertDigestToolCalls([
      "linear_get",
      "linear_get",
      "github_get",
      "get_tools",
      "list_tools",
      "notion_notion-search",
    ]);
  });

  it("rejects notion write tools during digest", () => {
    assert.throws(
      () =>
        assertDigestToolCalls([
          "linear.list_issues",
          "github.search_issues",
          "notion.notion-search",
          "notion.notion-create-pages",
        ]),
      /Unexpected tool call during digest scenario: notion\.notion-create-pages/,
    );
  });

  it("accepts gmail tool names in dot and underscore forms", () => {
    assertDigestGmailDraftCreated(["gmail.create_draft"]);
    assertDigestGmailDraftCreated(["gmail_create_draft"]);
  });

  it("detects policy_denied in follow-up tool errors", () => {
    assert.doesNotThrow(() =>
      assertPolicyDeniedVisible(
        fakeResult([], "Could not post to Notion.", [
          "policy_denied: notion.notion-create-pages",
        ]),
        "Could not post to Notion.",
      ),
    );
  });
});
