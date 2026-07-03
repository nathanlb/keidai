import { describe, expect, it } from "vitest";
import { formatTracePolicyDetail } from "../format-trace-policy-detail.js";
import {
  deniedTrace,
  githubServer,
  linkingRequiredTrace,
  successTrace,
} from "./trace-detail-fixtures.js";

describe("formatTracePolicyDetail", () => {
  it("describes policy denial without a matched rule", () => {
    expect(formatTracePolicyDetail(deniedTrace, githubServer)).toEqual({
      headline: "Denied by policy",
      reason:
        '"delete_repo" is not in the allow-list for server "github". The default action is deny, so the call was blocked before any credential or backend resolution.',
      variant: "denied",
      policyDefault: "deny",
      matchedRule: null,
    });
  });

  it("includes the matched allow rule for successful calls", () => {
    expect(formatTracePolicyDetail(successTrace, githubServer)).toMatchObject({
      headline: "Allowed by policy",
      variant: "allowed",
      policyDefault: "deny",
      matchedRule: "allow search_issues",
    });
  });

  it("explains downstream credential blocking for linking_required", () => {
    expect(formatTracePolicyDetail(linkingRequiredTrace, githubServer)).toEqual(
      {
        headline: "Allowed by policy",
        reason:
          "Policy permitted the call, but it was blocked downstream at credential resolution (see below).",
        variant: "allowed",
        policyDefault: "deny",
        matchedRule: "allow search_issues",
      },
    );
  });

  it("defaults policy to deny when server config is missing", () => {
    expect(formatTracePolicyDetail(deniedTrace)).toMatchObject({
      policyDefault: "deny",
      variant: "denied",
    });
  });
});
