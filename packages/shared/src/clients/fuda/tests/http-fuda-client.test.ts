import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHttpFudaClient } from "../http-fuda-client.js";
import { AgentDefinitionError, TokenExchangeError } from "../types.js";

describe("createHttpFudaClient.exchangeToken", () => {
  it("POSTs subject_token and agent_id and returns the minted JWT", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test/",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            access_token: "minted.jwt",
            token_type: "Bearer",
            expires_in: 300,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const token = await client.exchangeToken({
      subjectToken: "subject-secret",
      agentId: "agent-1",
    });

    assert.deepEqual(token, {
      accessToken: "minted.jwt",
      tokenType: "Bearer",
      expiresIn: 300,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "http://fuda.test/token");
    assert.equal(calls[0]?.init.method, "POST");
    assert.equal(
      (calls[0]?.init.headers as Record<string, string>)["content-type"],
      "application/json",
    );
    assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {
      subject_token: "subject-secret",
      agent_id: "agent-1",
    });
  });

  it("maps 403 to grant_denied", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () =>
        new Response(JSON.stringify({ error: "bearer not granted for agent" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    });

    await assert.rejects(
      () =>
        client.exchangeToken({
          subjectToken: "subject-secret",
          agentId: "agent-1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof TokenExchangeError);
        assert.equal(error.kind, "grant_denied");
        assert.equal(error.status, 403);
        assert.match(error.message, /denied agent grant/i);
        return true;
      },
    );
  });

  it("maps network failure to unreachable", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    await assert.rejects(
      () =>
        client.exchangeToken({
          subjectToken: "subject-secret",
          agentId: "agent-1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof TokenExchangeError);
        assert.equal(error.kind, "unreachable");
        assert.match(error.message, /unreachable/i);
        return true;
      },
    );
  });

  it("maps 401 to invalid_subject", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () =>
        new Response(JSON.stringify({ error: "invalid subject token" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    });

    await assert.rejects(
      () =>
        client.exchangeToken({
          subjectToken: "bad",
          agentId: "agent-1",
        }),
      (error: unknown) => {
        assert.ok(error instanceof TokenExchangeError);
        assert.equal(error.kind, "invalid_subject");
        return true;
      },
    );
  });
});

describe("createHttpFudaClient.getAgentDefinition", () => {
  it("GETs /agents/{id} and returns the definition", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test/",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(
          JSON.stringify({
            name: "Newsletter",
            slug: "newsletter",
            persona: "You write concise status newsletters.",
            personaVersion: 3,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const definition = await client.getAgentDefinition("agent-1");
    assert.deepEqual(definition, {
      name: "Newsletter",
      slug: "newsletter",
      persona: "You write concise status newsletters.",
      personaVersion: 3,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "http://fuda.test/agents/agent-1");
    assert.equal(calls[0]?.init.method, "GET");
  });

  it("URL-encodes agent ids", async () => {
    let requested = "";
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async (url) => {
        requested = String(url);
        return new Response(
          JSON.stringify({
            name: "A",
            slug: "a",
            persona: "persona",
            personaVersion: 1,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    await client.getAgentDefinition("agent/with spaces");
    assert.equal(
      requested,
      "http://fuda.test/agents/agent%2Fwith%20spaces",
    );
  });

  it("maps 404 to agent_not_found", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () =>
        new Response(JSON.stringify({ error: "agent not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    });

    await assert.rejects(
      () => client.getAgentDefinition("missing"),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "agent_not_found");
        assert.equal(error.status, 404);
        return true;
      },
    );
  });

  it("maps network failure to unreachable", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    await assert.rejects(
      () => client.getAgentDefinition("agent-1"),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "unreachable");
        assert.match(error.message, /unreachable/i);
        return true;
      },
    );
  });

  it("rejects an invalid response body", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () =>
        new Response(JSON.stringify({ name: "Newsletter" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });

    await assert.rejects(
      () => client.getAgentDefinition("agent-1"),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "unexpected");
        return true;
      },
    );
  });

  it("rejects a non-JSON success body", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });

    await assert.rejects(
      () => client.getAgentDefinition("agent-1"),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "unexpected");
        return true;
      },
    );
  });

  it("reads non-JSON error bodies as plain text", async () => {
    const client = createHttpFudaClient({
      baseUrl: "http://fuda.test",
      fetch: async () =>
        new Response("upstream gateway timeout", {
          status: 502,
          headers: { "content-type": "text/plain" },
        }),
    });

    await assert.rejects(
      () => client.getAgentDefinition("agent-1"),
      (error: unknown) => {
        assert.ok(error instanceof AgentDefinitionError);
        assert.equal(error.kind, "unexpected");
        assert.match(error.message, /upstream gateway timeout/);
        return true;
      },
    );
  });
});
