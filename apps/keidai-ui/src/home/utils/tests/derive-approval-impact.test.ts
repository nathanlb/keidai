import { describe, expect, it } from "vitest";
import { deriveApprovalImpact } from "../derive-approval-impact.js";

describe("deriveApprovalImpact", () => {
  it("reads a recipient, channel, or path from captured params", () => {
    expect(deriveApprovalImpact({ to: "team@example.com" })).toBe(
      "Sends to team@example.com",
    );
    expect(deriveApprovalImpact({ channel: "eng-all" })).toBe(
      "Posts to #eng-all",
    );
    expect(deriveApprovalImpact({ path: "/shared/invoices.csv" })).toBe(
      "Writes /shared/invoices.csv",
    );
  });

  it("returns an empty string when nothing identifiable is present", () => {
    expect(deriveApprovalImpact({ subject: "hello" })).toBe("");
  });
});
