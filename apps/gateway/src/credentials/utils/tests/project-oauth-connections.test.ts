import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PendingOAuthLink } from "../../types/pending-oauth-link.js";
import {
  deriveOAuthLinkStatus,
  projectOAuthConnectionStatus,
} from "../project-oauth-connections.js";

describe("deriveOAuthLinkStatus", () => {
  it("returns pending when a pending link exists", () => {
    const pending: PendingOAuthLink = {
      linkId: "link-1",
      ownerId: "owner",
      provider: "github",
      redirectUri: "http://localhost/callback",
      status: "pending",
      createdAt: new Date(),
    };
    assert.equal(deriveOAuthLinkStatus(null, pending).status, "pending");
  });

  it("returns failed with error from pending link", () => {
    const failed: PendingOAuthLink = {
      linkId: "link-1",
      ownerId: "owner",
      provider: "github",
      redirectUri: "http://localhost/callback",
      status: "failed",
      error: "access denied",
      createdAt: new Date(),
    };
    const result = deriveOAuthLinkStatus(null, failed);
    assert.equal(result.status, "failed");
    assert.equal(result.error, "access denied");
  });

  it("returns expired when token is expired without refresh token", () => {
    const result = deriveOAuthLinkStatus(
      {
        accessToken: "token",
        expiresAt: new Date("2000-01-01T00:00:00.000Z"),
      },
      null,
    );
    assert.equal(result.status, "expired");
  });
});

describe("projectOAuthConnectionStatus", () => {
  it("never includes access tokens in projection", () => {
    const projection = projectOAuthConnectionStatus(
      "owner",
      "github",
      ["repo"],
      {
        accessToken: "secret-token",
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
      null,
    );
    assert.equal(projection.status, "linked");
    assert.equal(projection.expiresAt, "2099-01-01T00:00:00.000Z");
    assert.equal("accessToken" in projection, false);
  });
});
