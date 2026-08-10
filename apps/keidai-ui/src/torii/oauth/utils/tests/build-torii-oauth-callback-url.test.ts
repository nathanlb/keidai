import { describe, expect, it } from "vitest";
import { getToriiOrigin } from "../../../api/torii-client.js";
import { buildToriiOAuthCallbackUrl } from "../build-torii-oauth-callback-url.js";

describe("buildToriiOAuthCallbackUrl", () => {
  it("uses the operator-edge origin, not Torii's internal port", () => {
    expect(getToriiOrigin()).toBe(window.location.origin);
    expect(buildToriiOAuthCallbackUrl("github")).toBe(
      `${window.location.origin}/oauth/callback/github`,
    );
  });
});
