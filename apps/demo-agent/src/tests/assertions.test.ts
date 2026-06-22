import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DigestResult } from "../assertions.js";
import {
  assertDigestReportShape,
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
  it("accepts expected digest tool calls and report shape", () => {
    const toolNames = [
      "linear.list_issues",
      "github.search_issues",
      "notion.notion-search",
      "gmail.send_gmail_message",
    ];
    const text = "## Linear\n- NAT-16 (Todo): demo harness\n\n## GitHub\n- 1 open PR\n\n## Notion\n- Architecture doc";

    assertDigestToolCalls(toolNames);
    assertDigestReportShape(text);
    assert.deepEqual(collectToolCallNames(fakeResult(toolNames, text)), toolNames);
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
