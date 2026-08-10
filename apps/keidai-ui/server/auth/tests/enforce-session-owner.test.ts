import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forceSessionOwnerOnAgentCreateBody,
  forceSessionOwnerOnOAuthInitiateUrl,
} from "../enforce-session-owner.js";

describe("forceSessionOwnerOnAgentCreateBody", () => {
  it("injects ownerId when the body omits it", () => {
    assert.deepEqual(
      forceSessionOwnerOnAgentCreateBody(
        { slug: "demo", name: "Demo", groups: [], persona: "hi" },
        "demo-owner",
      ),
      {
        slug: "demo",
        name: "Demo",
        groups: [],
        persona: "hi",
        ownerId: "demo-owner",
      },
    );
  });

  it("overwrites a client-supplied ownerId", () => {
    assert.deepEqual(
      forceSessionOwnerOnAgentCreateBody(
        { slug: "demo", ownerId: "other-owner" },
        "demo-owner",
      ),
      { slug: "demo", ownerId: "demo-owner" },
    );
  });

  it("returns a body with only ownerId for non-objects", () => {
    assert.deepEqual(forceSessionOwnerOnAgentCreateBody(null, "demo-owner"), {
      ownerId: "demo-owner",
    });
    assert.deepEqual(forceSessionOwnerOnAgentCreateBody("x", "demo-owner"), {
      ownerId: "demo-owner",
    });
  });
});

describe("forceSessionOwnerOnOAuthInitiateUrl", () => {
  it("sets owner when missing", () => {
    assert.equal(
      forceSessionOwnerOnOAuthInitiateUrl(
        "/oauth/initiate/github",
        "demo-owner",
      ),
      "/oauth/initiate/github?owner=demo-owner",
    );
  });

  it("overwrites a client-supplied owner", () => {
    assert.equal(
      forceSessionOwnerOnOAuthInitiateUrl(
        "/oauth/initiate/github?owner=other-owner&foo=1",
        "demo-owner",
      ),
      "/oauth/initiate/github?owner=demo-owner&foo=1",
    );
  });
});
