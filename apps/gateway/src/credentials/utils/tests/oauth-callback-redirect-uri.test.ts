import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOAuthCallbackRedirectUri } from "../oauth-callback-redirect-uri.js";

describe("buildOAuthCallbackRedirectUri", () => {
  it("derives the gateway callback path for a provider", () => {
    assert.equal(
      buildOAuthCallbackRedirectUri("http://127.0.0.1:3100", "github"),
      "http://127.0.0.1:3100/oauth/callback/github",
    );
  });

  it("strips a trailing slash from the base URL", () => {
    assert.equal(
      buildOAuthCallbackRedirectUri("http://127.0.0.1:3100/", "github"),
      "http://127.0.0.1:3100/oauth/callback/github",
    );
  });
});
