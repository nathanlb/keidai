import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forceSessionOwnerOnAgentCreateBody,
  forceSessionOwnerQuery,
  isInternalOnlyToriiPath,
  isSessionOwnerQueryRequest,
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

describe("forceSessionOwnerQuery", () => {
  it("sets owner when missing on OAuth initiate", () => {
    assert.equal(
      forceSessionOwnerQuery("/oauth/initiate/github", "demo-owner"),
      "/oauth/initiate/github?owner=demo-owner",
    );
  });

  it("overwrites a client-supplied owner on OAuth initiate", () => {
    assert.equal(
      forceSessionOwnerQuery(
        "/oauth/initiate/github?owner=other-owner&foo=1",
        "demo-owner",
      ),
      "/oauth/initiate/github?owner=demo-owner&foo=1",
    );
  });

  it("sets owner on connection reconnect paths", () => {
    assert.equal(
      forceSessionOwnerQuery("/api/connections/github/reconnect", "demo-owner"),
      "/api/connections/github/reconnect?owner=demo-owner",
    );
    assert.equal(
      forceSessionOwnerQuery("/connections/reconnect", "demo-owner"),
      "/connections/reconnect?owner=demo-owner",
    );
  });
});

describe("isSessionOwnerQueryRequest", () => {
  it("matches POST OAuth initiate and connection reconnect routes", () => {
    assert.equal(
      isSessionOwnerQueryRequest("POST", "/api/oauth/initiate/github"),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("POST", "/oauth/initiate/github?owner=other"),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("POST", "/api/connections/reconnect"),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("POST", "/api/connections/github/reconnect"),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("GET", "/api/oauth/initiate/github"),
      false,
    );
  });

  it("matches GET OAuth connections, connections, and SSE events routes", () => {
    assert.equal(
      isSessionOwnerQueryRequest("GET", "/api/oauth/connections?owner=other"),
      true,
    );
    assert.equal(isSessionOwnerQueryRequest("GET", "/oauth/connections"), true);
    assert.equal(isSessionOwnerQueryRequest("GET", "/api/connections"), true);
    assert.equal(isSessionOwnerQueryRequest("GET", "/connections"), true);
    assert.equal(
      isSessionOwnerQueryRequest("GET", "/api/connections/events"),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("GET", "/connections/events"),
      true,
    );
    assert.equal(isSessionOwnerQueryRequest("GET", "/api/groups"), false);
  });

  it("matches DELETE OAuth connection unlink routes", () => {
    assert.equal(
      isSessionOwnerQueryRequest(
        "DELETE",
        "/api/oauth/connections/github?owner=other",
      ),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("DELETE", "/oauth/connections/github"),
      true,
    );
    assert.equal(
      isSessionOwnerQueryRequest("DELETE", "/api/oauth/connections"),
      false,
    );
  });
});

describe("isInternalOnlyToriiPath", () => {
  it("flags internal /api/oauth/grants and /oauth/grants routes", () => {
    assert.equal(isInternalOnlyToriiPath("/api/oauth/grants/alice"), true);
    assert.equal(isInternalOnlyToriiPath("/oauth/grants/alice"), true);
    assert.equal(isInternalOnlyToriiPath("/api/oauth/grants"), true);
    assert.equal(isInternalOnlyToriiPath("/api/oauth/connections"), false);
  });
});
