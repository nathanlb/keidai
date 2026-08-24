import { describe, expect, it } from "vitest";
import { isToriiOAuthLinkMessage } from "../torii-oauth-link-message.js";

describe("isToriiOAuthLinkMessage", () => {
  it("accepts a valid success payload", () => {
    expect(
      isToriiOAuthLinkMessage({
        type: "torii-oauth-link",
        status: "success",
        linkId: "link-1",
        provider: "notion",
      }),
    ).toBe(true);
  });

  it("rejects unrelated messages", () => {
    expect(isToriiOAuthLinkMessage({ type: "other" })).toBe(false);
  });
});
